/-!
# List lemmas

Facts about joining and splitting lists of characters.
-/

namespace Hl7v2.Thm

theorem not_mem_intercalate {x y : Char} {ls : List (List Char)}
    (hxy : x ≠ y) (h : ∀ l ∈ ls, x ∉ l) : x ∉ [y].intercalate ls := by
  induction ls with
  | nil => simp
  | cons a t ih =>
    cases t with
    | nil => simpa using h a (by simp)
    | cons b t' =>
      rw [List.intercalate_cons_cons]
      simp only [List.mem_append, List.mem_singleton, not_or]
      exact ⟨⟨h a (by simp), hxy⟩, ih (fun l hl => h l (List.mem_cons_of_mem _ hl))⟩

/-- Splitting a join recovers the parts, then `p` undoes `u` on each. -/
theorem map_splitOn_intercalate {α} (x : Char) (p : List Char → α) (u : α → List Char)
    (t : List α) (ht : t ≠ []) (hx : ∀ a ∈ t, x ∉ u a) (hp : ∀ a ∈ t, p (u a) = a) :
    (([x].intercalate (t.map u)).splitOn x).map p = t := by
  rw [List.splitOn_intercalate]
  · rw [List.map_map]
    conv => rhs; rw [← List.map_id t]
    exact List.map_congr_left (fun a ha => hp a ha)
  · intro l hl
    obtain ⟨a, ha, rfl⟩ := List.mem_map.1 hl
    exact hx a ha
  · simpa using ht

theorem flatMap_cons_eq_intercalate {α} (x : Char) (g : α → List Char) (l : List α)
    (hl : l ≠ []) : l.flatMap (fun a => x :: g a) = x :: [x].intercalate (l.map g) := by
  induction l with
  | nil => contradiction
  | cons a t ih =>
    cases t with
    | nil => simp
    | cons b t' =>
      rw [List.flatMap_cons, ih (by simp)]
      simp [List.intercalate_cons_cons]

theorem dropLast_flatMap_append (x : Char) (l : List (List Char)) (hl : l ≠ []) :
    (l.flatMap (· ++ [x])).dropLast = [x].intercalate l := by
  induction l with
  | nil => contradiction
  | cons a t ih =>
    cases t with
    | nil => simp
    | cons b t' =>
      rw [List.flatMap_cons, List.intercalate_cons_cons, ← ih (by simp)]
      rw [List.dropLast_append_of_ne_nil (by simp)]

/-- `List.filter_eq_nil_iff`, proved without `Classical.choice`. -/
theorem filter_eq_nil_iff {α : Type} {p : α → Bool} :
    ∀ {l : List α}, l.filter p = [] ↔ ∀ a ∈ l, p a = false
  | [] => by simp
  | a :: l => by
    cases h : p a <;> simp [List.filter, h, filter_eq_nil_iff]

end Hl7v2.Thm
