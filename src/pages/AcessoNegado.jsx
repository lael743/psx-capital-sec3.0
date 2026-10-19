import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';

export default function AcessoNegado() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center">
      <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        <Lock className="w-7 h-7 text-muted-foreground" />
      </div>
      <h1 className="text-xl font-bold mb-2">Acesso Restrito</h1>
      <p className="text-sm text-muted-foreground max-w-xs mb-6">
        Você não tem permissão para acessar esta página. Entre em contato com o administrador para solicitar acesso.
      </p>
      <Link
        to="/"
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-foreground text-primary-foreground text-sm font-semibold rounded-lg hover:bg-foreground/90 transition-colors"
      >
        Voltar ao início
      </Link>
    </div>
  );
}