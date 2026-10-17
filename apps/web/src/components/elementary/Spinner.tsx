interface Props {
  /** Extra Bootstrap classes, e.g. `text-danger` for the ring color. */
  readonly className?: string;
  /** Ring diameter in px. */
  readonly size?: number;
  /** Accessible label announced while loading. */
  readonly label?: string;
}

/** Bootstrap 5 border spinner; the ring takes the current text color. */
export function Spinner({
  className = '',
  size = 32,
  label = 'Loading',
}: Props) {
  return (
    <span
      className={`spinner-border ${className}`.trim()}
      style={{ width: size, height: size }}
      role="status"
    >
      <span className="visually-hidden">{label}</span>
    </span>
  );
}
