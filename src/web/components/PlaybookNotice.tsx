import { LeafIcon } from "./icons";

interface PlaybookNoticeProps {
  label: string;
  reason: string;
}

/** Ligne discrète dans le fil, distincte des bulles, quand un playbook produit se charge. */
export function PlaybookNotice({ label, reason }: PlaybookNoticeProps) {
  return (
    <div className="playbook-notice" role="note">
      <LeafIcon className="playbook-notice__icon" />
      <div>
        <p className="playbook-notice__title">{label} activés</p>
        <p className="playbook-notice__reason">{reason}</p>
      </div>
    </div>
  );
}
