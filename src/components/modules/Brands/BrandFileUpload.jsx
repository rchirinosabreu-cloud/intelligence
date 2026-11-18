import React, { useRef } from 'react';
import { toast } from 'react-hot-toast';
import { Loader2, Upload } from '@/components/ui/icons';
import { brandFileProblem } from '@/lib/clientBrand';
import { useUploadBrandFile } from './brandsApi';

const ACCEPT = {
    LOGO: '.png,.jpg,.jpeg,.webp,.pdf,.ai,.eps,.zip',
    FUENTE: '.ttf,.otf,.woff,.woff2,.zip',
    MANUAL: '.pdf,.zip',
    RECURSO: '.png,.jpg,.jpeg,.webp,.pdf,.zip'
};

/** Sube un archivo a la marca. Frena con la misma regla del servidor antes de gastar la subida. */
export default function BrandFileUpload({ clientId, kind, label }) {
    const input = useRef(null);
    const upload = useUploadBrandFile();

    const choose = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        const problem = brandFileProblem({ kind, name: file.name, size: file.size });
        if (problem) {
            toast.error(problem);
            return;
        }
        try {
            await upload.mutateAsync({ clientId, kind, file });
            toast.success(`«${file.name}» quedó en la marca`);
        } catch (error) {
            toast.error(error.message);
        }
    };

    return (
        <>
            <input ref={input} type="file" accept={ACCEPT[kind]} className="hidden" onChange={choose} aria-hidden="true" tabIndex={-1} />
            <button
                type="button"
                onClick={() => input.current?.click()}
                disabled={upload.isPending}
                className="brain-button-quiet inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-60 dark:text-zinc-200 dark:hover:bg-white/10"
            >
                {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
                {label}
            </button>
        </>
    );
}
