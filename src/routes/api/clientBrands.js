import express from 'express';
import multer from 'multer';
import { clientBrandService } from '../../services/clientBrandService.js';
import { BRAND_LIMITS, canEditBrand } from '../../lib/clientBrand.js';
import { uploadMemoryStorage } from '../../lib/uploadStorage.js';
import { receivesFiles } from '../../lib/uploadMarker.js';

// Marcas de los clientes (Rodny, 18 de noviembre de 2026): la pestaña «Marcas» del módulo de Clientes. Ver es
// de quien tiene Clientes (la ruta se monta con `requireModulePermission('clientes')`); escribir pide además
// `canEditBrand`, comprobado aquí y no solo en la pantalla. Los errores salen en español, nunca un código.

/** Escribir una marca. La etiqueta `permission` la lee el mapa de Bria. */
export const requireBrandEdit = (req, res, next) => (canEditBrand(req.user)
    ? next()
    : res.status(403).json({ error: 'Para editar marcas necesitas el módulo de Clientes. Pídeselo a un administrador en Equipo.' }));
requireBrandEdit.permission = { module: 'clientes' };

const upload = multer({ storage: uploadMemoryStorage(), limits: { fileSize: BRAND_LIMITS.fileBytes, files: 1 } });

export const createClientBrandRouter = ({ service = null } = {}) => {
    const router = express.Router();
    const brands = () => service || clientBrandService();
    const handle = (work, status = 200) => async (req, res) => {
        try {
            return res.status(status).json(await work(req));
        } catch (error) {
            if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
            if (error.status === 503) return res.status(503).json({ error: error.message });
            console.error('[Brands API] No se pudo completar:', error);
            return res.status(500).json({ error: 'No se pudo completar la operación. Inténtalo de nuevo.' });
        }
    };

    const receiveFile = (req, res, next) => upload.single('file')(req, res, (error) => {
        if (!error) return next();
        const message = error.code === 'LIMIT_FILE_SIZE' ? 'El archivo pesa más de 50 MB.' : 'No se pudo recibir el archivo.';
        return res.status(400).json({ error: message });
    });

    router.get('/', handle(async (req) => ({ ...(await brands().list()), canEdit: canEditBrand(req.user) })));
    router.get('/:clientId', handle(async (req) => ({ ...(await brands().get(req.params.clientId)), canEdit: canEditBrand(req.user) })));
    router.put('/:clientId', requireBrandEdit, handle((req) => brands().save(req.params.clientId, req.body || {}, req.user)));
    router.post('/:clientId/files', requireBrandEdit, receivesFiles(receiveFile, { field: 'file' }), handle(
        (req) => brands().addFile(req.params.clientId, { kind: req.body?.kind, label: req.body?.label, file: req.file }, req.user), 201
    ));
    router.delete('/:clientId/files/:fileId', requireBrandEdit, handle((req) => brands().removeFile(req.params.clientId, req.params.fileId, req.user)));

    // Bajar una tipografía de Google de la ficha en un .zip (?family=Nombre).
    router.get('/:clientId/fonts/download', async (req, res) => {
        try {
            const { name, buffer } = await brands().googleFontZip(req.params.clientId, req.query.family);
            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
            res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
            res.setHeader('Cache-Control', 'private, max-age=3600');
            return res.send(buffer);
        } catch (error) {
            if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
            console.error('[Brands API] No se pudo armar la tipografía:', error);
            return res.status(500).json({ error: 'No se pudo bajar la tipografía. Inténtalo de nuevo.' });
        }
    });

    // Ver o descargar un archivo: pasa por el servidor para que la clave del almacenamiento nunca salga.
    router.get('/:clientId/files/:fileId', async (req, res) => {
        try {
            const { file } = await brands().fileLink(req.params.clientId, req.params.fileId);
            const object = await brands().openFile(file);
            const disposition = req.query.download === '1' ? 'attachment' : 'inline';
            res.setHeader('Content-Type', file.mimeType || object.ContentType || 'application/octet-stream');
            res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(file.name || 'archivo')}`);
            res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
            res.setHeader('Cache-Control', 'private, max-age=300');
            return object.Body.pipe(res);
        } catch (error) {
            if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
            console.error('[Brands API] No se pudo abrir el archivo:', error);
            return res.status(500).json({ error: 'No se pudo abrir el archivo. Inténtalo de nuevo.' });
        }
    });

    return router;
};
