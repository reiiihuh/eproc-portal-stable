const allowedExtensions = ["pdf", "doc", "docx", "xls", "xlsx"];
export const maximumFileSize = 10 * 1024 * 1024;
export const allowedFileDescription = "PDF, DOC, DOCX, XLS, XLSX";

export function validateDocument(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!allowedExtensions.includes(extension)) {
    throw new Error(`${file.name}: format file tidak didukung.`);
  }
  if (file.size > maximumFileSize) {
    throw new Error(`${file.name}: ukuran file melebihi 10 MB.`);
  }
}

