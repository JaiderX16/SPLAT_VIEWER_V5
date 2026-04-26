import { useState, useCallback, useRef, useEffect } from 'react';

const SUPPORTED_FORMATS = ['splat', 'ply'];
const MAX_FILE_SIZE_MB = 500;

function validateFile(file: File): { valid: boolean; error?: string } {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

  if (!SUPPORTED_FORMATS.includes(ext)) {
    return { valid: false, error: `Formato no soportado. Usa .splat o .ply` };
  }

  const sizeMB = file.size / (1024 * 1024);
  if (sizeMB > MAX_FILE_SIZE_MB) {
    return { valid: false, error: `Archivo demasiado grande (${sizeMB.toFixed(1)}MB). Máximo: ${MAX_FILE_SIZE_MB}MB` };
  }

  return { valid: true };
}

export interface GalleryModel {
  id: string;
  name: string;
  path: string;
  format: string;
}

interface UseActiveSceneReturn {
  activeId: string;
  fileUrl: string | null;
  format: string;
  error: string | null;
  clearError: () => void;
  selectModel: (model: GalleryModel) => void;
  handleUpload: (file: File) => boolean;
}

export function useActiveScene(initialModel: GalleryModel): UseActiveSceneReturn {
  const [activeId, setActiveId] = useState(initialModel.id);
  const [fileUrl, setFileUrl] = useState<string | null>(initialModel.path);
  const [format, setFormat] = useState(initialModel.format);
  const [error, setError] = useState<string | null>(null);
  const uploadedUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (uploadedUrlRef.current) {
        try { URL.revokeObjectURL(uploadedUrlRef.current); } catch (_) {}
      }
    };
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const selectModel = useCallback((model: GalleryModel) => {
    if (uploadedUrlRef.current) {
      try { URL.revokeObjectURL(uploadedUrlRef.current); } catch (_) {}
      uploadedUrlRef.current = null;
    }
    setError(null);
    setActiveId(model.id);
    setFileUrl(model.path);
    setFormat(model.format);
  }, []);

  const handleUpload = useCallback((file: File): boolean => {
    setError(null);
    const validation = validateFile(file);
    if (!validation.valid) {
      setError(validation.error ?? 'Archivo inválido');
      return false;
    }

    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'splat';

    if (uploadedUrlRef.current) {
      try { URL.revokeObjectURL(uploadedUrlRef.current); } catch (_) {}
    }

    try {
      const url = URL.createObjectURL(file);
      uploadedUrlRef.current = url;
      setActiveId('__upload__');
      setFileUrl(url);
      setFormat(ext);
      return true;
    } catch (e) {
      setError('Error al procesar el archivo');
      return false;
    }
  }, []);

  return { activeId, fileUrl, format, error, clearError, selectModel, handleUpload };
}
