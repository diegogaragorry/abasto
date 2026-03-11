import type { BatchSummary } from '@abasto/shared';
import { useState } from 'react';
import { uploadFeriaPdf } from '../routes/api';

interface FeriaUploadProps {
  onUploaded: (summary: BatchSummary) => void;
  isAdminAuthenticated: boolean;
}

export function FeriaUpload({ onUploaded, isAdminAuthenticated }: FeriaUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  async function handleUpload() {
    if (!selectedFile) {
      setError('Elegí primero un PDF.');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const summary = await uploadFeriaPdf(selectedFile);
      onUploaded(summary);
      setSelectedFile(null);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'No se pudo subir el archivo.');
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <section className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Importación de feria</p>
          <h3>Subir un lote en PDF</h3>
        </div>
      </div>

      <div className="stack">
        <input
          type="file"
          accept="application/pdf"
          onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
        />
        <button type="button" onClick={handleUpload} disabled={isUploading || !isAdminAuthenticated}>
          {isUploading ? 'Subiendo...' : 'Subir PDF'}
        </button>
      </div>

      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
