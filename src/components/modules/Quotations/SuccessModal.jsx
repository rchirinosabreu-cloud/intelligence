import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Copy, Check, ExternalLink, Globe } from 'lucide-react';
import { toast } from 'react-hot-toast';

const SuccessModal = ({ isOpen, onClose, link }) => {
    const [copied, setCopied] = React.useState(false);

    const copyToClipboard = () => {
        navigator.clipboard.writeText(link);
        setCopied(true);
        toast.success("Enlace copiado");
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md rounded-2xl">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold flex items-center gap-2">
                        <div className="p-2 bg-green-500/10 rounded-lg">
                            <Check className="w-5 h-5 text-green-500" />
                        </div>
                        Propuesta Generada
                    </DialogTitle>
                    <DialogDescription className="text-zinc-500">
                        La cotización ha sido guardada. Comparte este enlace con el cliente.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex items-center space-x-2 bg-zinc-50 dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
                    <div className="grid flex-1 gap-2 overflow-hidden">
                        <p className="text-xs font-bold text-zinc-400 uppercase flex items-center gap-2">
                            <Globe className="w-3 h-3" /> Enlace de la propuesta
                        </p>
                        <input
                            className="bg-transparent text-sm outline-none truncate"
                            value={link}
                            readOnly
                        />
                    </div>
                    <Button
                        size="icon"
                        variant="ghost"
                        onClick={copyToClipboard}
                        className="shrink-0"
                    >
                        {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    </Button>
                </div>

                <DialogFooter className="sm:justify-start gap-3 pt-4">
                    <Button
                        type="button"
                        className="flex-1 rounded-xl h-12 font-bold"
                        onClick={() => window.open(link, '_blank')}
                    >
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Ver Propuesta
                    </Button>
                    <Button
                        type="button"
                        variant="secondary"
                        className="rounded-xl h-12 px-6"
                        onClick={onClose}
                    >
                        Cerrar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default SuccessModal;
