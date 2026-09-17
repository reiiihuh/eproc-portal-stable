const statusClass = (status: string) =>
  status.toLowerCase().replaceAll("_", "-").replaceAll(" ", "-");

export function LabelStatus({ status }: { status: string }) {
  return <span className={`status status-${statusClass(status)}`}>{status}</span>;
}

