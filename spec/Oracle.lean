import Lean.Data.Json
import Hl7v2

/-!
# The specification as a program

Reads one message per line as JSON, and answers on one line with what the
specification says about it: its encoding (`encode`) and the rules it breaks
(`Message.failures`).

Input: `{"delimiters": "|^~\\&", "header": [field, …], "segments": [{"id": "PID", "fields": [field, …]}, …]}`,
where a field is a list of repetitions, a repetition a list of components, and a
component a list of subcomponents. A subcomponent is a string of characters, or a
list whose items are strings of characters and escape sequences: `"Smith"`, or
`[{"sequence": "H"}, "240*", {"sequence": "N"}]` for `\H\240*\N\`.

Output: `{"text": "MSH|^~\\&\r…", "failures": ["well_formed_…", …]}`.
-/

open Lean Hl7v2.Spec

def chars (j : Json) : Except String (List Char) := return (← j.getStr?).toList

def list (j : Json) : Except String (List Json) := return (← j.getArr?).toList

def piece (j : Json) : Except String (List Piece) :=
  match j.getObjVal? "sequence" with
  | .ok code => return [.sequence (← chars code)]
  | .error _ => return (← chars j).map .char

def subcomponent (j : Json) : Except String Subcomponent :=
  match j.getStr? with
  | .ok s => return s.toList.map .char
  | .error _ => return (← list j >>= List.mapM piece).flatten

def field (j : Json) : Except String Field :=
  list j >>= List.mapM fun r => list r >>= List.mapM fun c => list c >>= List.mapM subcomponent

def delimiters (j : Json) : Except String Delimiters := do
  match ← chars j with
  | [f, c, r, e, s] => return ⟨f, c, r, e, s⟩
  | _ => throw "delimiters must be five characters: field, component, repetition, escape, subcomponent"

def segment (j : Json) : Except String Segment :=
  return ⟨← chars (← j.getObjVal? "id"), ← list (← j.getObjVal? "fields") >>= List.mapM field⟩

def message (j : Json) : Except String Message :=
  return ⟨← delimiters (← j.getObjVal? "delimiters"),
    ← list (← j.getObjVal? "header") >>= List.mapM field,
    ← list (← j.getObjVal? "segments") >>= List.mapM segment⟩

def answer (line : String) : Json :=
  match Json.parse line >>= message with
  | .ok m => Json.mkObj [("text", Json.str (String.ofList (encode m))), ("failures", toJson m.failures)]
  | .error e => Json.mkObj [("error", Json.str e)]

partial def loop (stdin stdout : IO.FS.Stream) : IO Unit := do
  let line ← stdin.getLine
  if line.isEmpty then return
  stdout.putStrLn (answer line).compress
  stdout.flush
  loop stdin stdout

def main : IO Unit := do
  loop (← IO.getStdin) (← IO.getStdout)
