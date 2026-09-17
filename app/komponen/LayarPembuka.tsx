import { MerekNano } from "./MerekNano";

export function LayarPembuka() {
  return (
    <main className="splash">
      <div className="splash-card">
        <MerekNano />
        <div className="splash-rule" />
        <h1>Nano Procurement</h1>
        <p>Menyiapkan portal pengadaan.</p>
        <div className="loader" aria-label="Memuat">
          <i />
          <i />
          <i />
        </div>
      </div>
    </main>
  );
}

