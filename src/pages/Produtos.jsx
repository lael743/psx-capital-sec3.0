import ProdutosManager from '@/components/produtos/ProdutosManager';
import { Package } from 'lucide-react';

export default function Produtos() {
  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Package className="w-5 h-5" /> Produtos de Operação
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Cadastre e parametrize produtos com formato de cálculo e condições padrão.
        </p>
      </div>
      <ProdutosManager />
    </div>
  );
}