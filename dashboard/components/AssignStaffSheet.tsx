import type { SalonStaff } from '@/lib/notifications';

type Props = {
  visible: boolean;
  staff: SalonStaff[];
  onDismiss: () => void;
  onSelect: (staffId: string | null) => void;
};

// A "first available" request comes in unassigned - if the salon has 2+
// groomers, ask which one takes it (the whole group, if it's a multi-pet
// visit) before confirming. Mirrors the RN app's showActionSheet-based
// assignment prompt in app/(salon)/index.tsx's handleAccept.
export function AssignStaffSheet({ visible, staff, onDismiss, onSelect }: Props) {
  if (!visible) return null;

  return (
    <div className="modal-backdrop" onClick={onDismiss}>
      <div className="card modal-panel" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Assign a groomer</h3>
        <div className="assign-list">
          {staff.map((member) => (
            <button key={member.id} className="assign-option" onClick={() => onSelect(member.id)}>
              {member.name}
            </button>
          ))}
          <button className="assign-option assign-option-muted" onClick={() => onSelect(null)}>
            Leave unassigned
          </button>
        </div>
      </div>
    </div>
  );
}
