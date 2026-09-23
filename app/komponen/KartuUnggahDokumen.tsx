import { Download, FileCheck2, FileText, Info, UploadCloud } from "lucide-react";
import { documentDescription } from "../layanan/format-tampilan";
import type { DocumentRequirement } from "../tipe/data-portal";

export const acceptedFileTypes = ".pdf,.doc,.docx,.xls,.xlsx";

export function KartuUnggahDokumen({
  item,
  file,
  onFile,
}: {
  item: DocumentRequirement;
  file?: File;
  onFile: (file: File) => void;
}) {
  return (
    <div className={`doccard ${file ? "uploaded" : ""}`}>
      <div className="docicon"><FileText size={20} /></div>
      <div className="docinfo">
        <div>
          <strong>{item.type}</strong>
          <b className={item.required ? "required" : "optional"}>{item.required ? "Wajib" : "Opsional"}</b>
        </div>
        <small className="document-description">{documentDescription(item.type)}</small>
        {file && <span className="document-file-name" title={file.name}>{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</span>}
        <div className="doclinks">
          {item.templateUrl && <a href={item.templateUrl} target="_blank" rel="noreferrer"><Download size={14} /> Template</a>}
          {item.guideUrl && <a href={item.guideUrl} target="_blank" rel="noreferrer"><Info size={14} /> Petunjuk</a>}
          {item.exampleUrl && <a href={item.exampleUrl} target="_blank" rel="noreferrer"><FileCheck2 size={14} /> Contoh</a>}
        </div>
      </div>
      <label className="upload">
        <UploadCloud size={16} /> {file ? "Ganti file" : "Pilih file"}
        <input
          hidden
          type="file"
          accept={acceptedFileTypes}
          onChange={(event) => {
            const next = event.target.files?.[0];
            event.target.value = "";
            if (next) onFile(next);
          }}
        />
      </label>
    </div>
  );
}
