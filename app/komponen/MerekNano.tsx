import Image from "next/image";

export function MerekNano({
  inverse = false,
  compact = false,
  monogram = false,
}: {
  inverse?: boolean;
  compact?: boolean;
  monogram?: boolean;
}) {
  return (
    <div className={`brand ${inverse ? "brand-inverse" : ""} ${monogram ? "brand-monogram" : ""}`}>
      <Image src="/logo-nano.png" alt="Bank Nano Syariah" width={300} height={120} priority />
      {!compact && !monogram && <span>Procurement Portal</span>}
    </div>
  );
}
