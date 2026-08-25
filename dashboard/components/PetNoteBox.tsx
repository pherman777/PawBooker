// Read-only display of the groomer's own private grooming note (blade/guard,
// temperament) right where they're about to work on the pet - so they don't
// have to tab over to Customers mid-appointment. Editing happens there, not
// here. Reuses the neutral pet-care-box look since this is reference info,
// not an alert.
export function PetNoteBox({ note }: { note: string }) {
  if (!note.trim()) return null;

  return (
    <div className="pet-care-box">
      <p className="pet-care-notes-label">Grooming notes</p>
      <p className="pet-care-notes">{note.trim()}</p>
    </div>
  );
}
