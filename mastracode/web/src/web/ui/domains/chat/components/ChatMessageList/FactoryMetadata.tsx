export function FactoryMetadata({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="flex gap-2">
      <dt className="text-icon2 min-w-24">{label}</dt>
      <dd className="text-icon5 m-0 break-words">{value}</dd>
    </div>
  );
}
