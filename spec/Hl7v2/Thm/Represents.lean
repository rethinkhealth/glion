import Hl7v2.Spec

/-!
# The text of a message

The sender writes a text that represents its message, and no other text
represents it: a message has exactly one text.
-/

namespace Hl7v2.Thm

open Hl7v2.Spec

/-! ## The two shapes -/

/-- Items with a separator between them: the texts of the items, joined. -/
theorem separated_iff {α : Type} {sep : Char} {R : List Char → α → Prop} {f : α → List Char}
    (h : ∀ t a, R t a ↔ t = f a) (text : List Char) (items : List α) :
    Separated sep R text items ↔ text = [sep].intercalate (items.map f) := by
  constructor
  · intro hs
    induction hs with
    | nil => rfl
    | one hr => simpa using (h _ _).1 hr
    | cons hr _ ih =>
      rw [(h _ _).1 hr, ih]
      simp [List.intercalate_cons_cons]
  · intro ht
    subst ht
    induction items with
    | nil => exact .nil
    | cons a as ih =>
      cases as with
      | nil => exact .one ((h _ _).2 (by simp))
      | cons b as =>
        have : [sep].intercalate ((a :: b :: as).map f)
            = f a ++ sep :: [sep].intercalate ((b :: as).map f) := by
          simp [List.intercalate_cons_cons]
        rw [this]
        exact .cons ((h _ _).2 rfl) ih

/-- Items one after another: the texts of the items, appended. -/
theorem concatenated_iff {α : Type} {R : List Char → α → Prop} {f : α → List Char}
    (h : ∀ t a, R t a ↔ t = f a) (text : List Char) (items : List α) :
    Concatenated R text items ↔ text = items.flatMap f := by
  constructor
  · intro hs
    induction hs with
    | nil => rfl
    | cons hr _ ih => rw [(h _ _).1 hr, ih, List.flatMap_cons]
  · intro ht
    subst ht
    induction items with
    | nil => exact .nil
    | cons a as ih => exact .cons ((h _ _).2 rfl) ih

/-! ## Each level -/

variable {d : Delimiters}

theorem representsComponent_iff (text : List Char) (c : Component) :
    RepresentsComponent d text c ↔ text = encodeComponent d c := by
  have h := separated_iff (sep := d.subcomponent) (R := fun t s => t = s) (f := id)
    (fun _ _ => Iff.rfl) text c
  rwa [List.map_id] at h

theorem representsRepetition_iff (text : List Char) (r : Repetition) :
    RepresentsRepetition d text r ↔ text = encodeRepetition d r :=
  separated_iff representsComponent_iff text r

theorem representsField_iff (text : List Char) (f : Field) :
    RepresentsField d text f ↔ text = encodeField d f :=
  separated_iff representsRepetition_iff text f

theorem representsFields_iff (text : List Char) (fields : List Field) :
    RepresentsFields d text fields ↔ text = encodeFields d fields := by
  refine concatenated_iff (fun t f => ?_) text fields
  constructor
  · rintro ⟨u, rfl, hu⟩
    rw [(representsField_iff u f).1 hu]
  · intro ht
    exact ⟨_, ht, (representsField_iff _ f).2 rfl⟩

theorem representsSegment_iff (text : List Char) (s : Segment) :
    RepresentsSegment d text s ↔ text = encodeSegment d s := by
  constructor
  · rintro ⟨u, rfl, hu⟩
    rw [(representsFields_iff u s.fields).1 hu, encodeSegment]
  · intro ht
    exact ⟨_, ht, (representsFields_iff _ s.fields).2 rfl⟩

theorem representsSegments_iff (text : List Char) (segments : List Segment) :
    RepresentsSegments d text segments
      ↔ text = segments.flatMap fun s => encodeSegment d s ++ [segmentTerminator] := by
  refine concatenated_iff (fun t s => ?_) text segments
  constructor
  · rintro ⟨u, rfl, hu⟩
    rw [(representsSegment_iff u s).1 hu]
  · intro ht
    exact ⟨_, ht, (representsSegment_iff _ s).2 rfl⟩

/-! ## The message -/

/-- A text represents a message exactly when it is the text the sender writes. -/
theorem represents_iff (text : List Char) (m : Message) :
    Represents text m ↔ text = encode m := by
  have he : encode m = mshId ++ m.delimiters.field :: m.delimiters.encodingCharacters
      ++ encodeFields m.delimiters m.header ++ segmentTerminator ::
        m.segments.flatMap fun s => encodeSegment m.delimiters s ++ [segmentTerminator] := by
    simp [encode, encodeHeader, List.flatMap_map]
  constructor
  · rintro ⟨header, segments, rfl, hh, hs⟩
    rw [(representsFields_iff _ _).1 hh, (representsSegments_iff _ _).1 hs, he]
  · intro ht
    exact ⟨_, _, ht.trans he, (representsFields_iff _ _).2 rfl, (representsSegments_iff _ _).2 rfl⟩

/-- **The sender writes a text of its message** (`sender_writes_a_text`). -/
theorem encode_represents (m : Message) : Represents (encode m) m :=
  (represents_iff _ m).2 rfl

/-- **One message, one text** (`one_message_one_text`). Two texts that represent
the same message are the same text. -/
theorem represents_text_unique {t₁ t₂ : List Char} {m : Message} (h₁ : Represents t₁ m)
    (h₂ : Represents t₂ m) : t₁ = t₂ := by
  rw [(represents_iff t₁ m).1 h₁, (represents_iff t₂ m).1 h₂]

end Hl7v2.Thm
