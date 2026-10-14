import multer from 'multer';
import { decodeUploadedFilename } from './uploadFilename.js';

// La puerta por la que entra **toda** subida de la plataforma (Rodny, 14 de octubre de
// 2026). Es `multer.memoryStorage()` con una sola diferencia: arregla el nombre del
// archivo antes de que ningún módulo lo lea.
//
// Se hace aquí y no en cada ruta porque hay catorce puntos de subida —Drive, parrillas,
// financiero, chat, reportes, Bria, avatares— y el defecto era el mismo en todos: el
// nombre llegaba leído byte a byte y «Gestión» se guardaba como «GestiÃ³n». Corregirlo
// módulo por módulo habría dejado fuera al siguiente que alguien añada.
//
// `tests/uploadFilename.test.js` exige que nadie use `multer.memoryStorage()` directo.

/**
 * Para las subidas que no guardan en memoria (el chat del equipo escribe a disco): se
 * pasa como `fileFilter` y corrige el nombre antes de que multer lo almacene.
 */
export const acceptUpload = (req, file, callback) => {
    file.originalname = decodeUploadedFilename(file.originalname);
    return callback(null, true);
};

export const uploadMemoryStorage = () => {
    const storage = multer.memoryStorage();
    return {
        _handleFile(req, file, callback) {
            file.originalname = decodeUploadedFilename(file.originalname);
            return storage._handleFile(req, file, callback);
        },
        _removeFile(req, file, callback) {
            return storage._removeFile(req, file, callback);
        }
    };
};
