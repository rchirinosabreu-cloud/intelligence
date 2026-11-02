import React from 'react';
import { createRoot } from 'react-dom/client';
import { jsPDF } from 'jspdf';
import PdfDocumentPreview from '../../src/components/modules/Drive/PdfDocumentPreview';
import '../../src/index.css';

// Muestra local del visor de PDF (30 de octubre de 2026, al subir pdf.js a la 6). Es el visor real: lo único
// ficticio es el PDF, que se genera aquí mismo con la misma librería que arma las cuentas de cobro. Sirve para
// comprobar lo que no se ve al compilar: que el worker y la librería sean de la misma versión y que se pinte.

const hacerPdf = () => {
  const doc = new jsPDF();
  doc.setFontSize(22);
  doc.text('Cuenta de cobro de prueba', 20, 30);
  doc.setFontSize(12);
  doc.text('Este PDF se genera en el navegador para comprobar el visor.', 20, 45);
  doc.text('Si lo estás leyendo, pdf.js y su worker son de la misma versión.', 20, 55);
  doc.addPage();
  doc.setFontSize(16);
  doc.text('Segunda página', 20, 30);
  return new Uint8Array(doc.output('arraybuffer'));
};

function Pagina() {
  const [data, setData] = React.useState(null);
  React.useEffect(() => {
    if (new URLSearchParams(window.location.search).get('tema') === 'dark') document.documentElement.classList.add('dark');
    setData(hacerPdf());
  }, []);

  return (
    <div className="min-h-screen bg-zinc-50 p-8 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <h1 className="mb-1 text-xl font-bold">Visor de PDF</h1>
      <p className="mb-6 text-sm text-zinc-500" data-pdfjs-version>Comprobando pdf.js y su worker…</p>
      <div data-pdf-viewer className="mx-auto max-w-3xl">
        {data ? <PdfDocumentPreview data={data} name="prueba.pdf" /> : null}
      </div>
    </div>
  );
}

// Deja a la vista qué versión cargó, para que la captura lo diga sin tener que creerle a nadie.
import('pdfjs-dist').then((pdfjs) => {
  const el = document.querySelector('[data-pdfjs-version]');
  if (el) el.textContent = `pdf.js ${pdfjs.version} · worker de la misma versión o el visor no pinta nada`;
});

createRoot(document.getElementById('root')).render(<Pagina />);
