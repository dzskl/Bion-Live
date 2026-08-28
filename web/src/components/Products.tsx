import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Product } from '../types';
import { Card, money } from './ui';

export function ProductsEditor({ compact = false, onChange }: { compact?: boolean; onChange?: (n: number) => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [highlight, setHighlight] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function refresh(): Promise<void> {
    const { products: list } = await api.products();
    setProducts(list);
    onChange?.(list.filter((p) => p.active).length);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function add(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.createProduct({ name, price, highlight });
      setName('');
      setPrice('');
      setHighlight('');
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const body = (
    <>
      <form className="product-form" onSubmit={add}>
        <input
          className="grow"
          placeholder="Nome do produto"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          className="price"
          placeholder="R$ 89,90"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          required
        />
        <input
          className="grow"
          placeholder="Frase de destaque (o que faz vender)"
          value={highlight}
          onChange={(e) => setHighlight(e.target.value)}
        />
        <button className="btn primary" disabled={busy}>
          Adicionar
        </button>
      </form>
      {error && <p className="error">{error}</p>}

      {products.length === 0 ? (
        <p className="muted empty">Nenhum produto ainda. Adicione o primeiro acima — leva 20 segundos.</p>
      ) : (
        <ul className="product-list">
          {products.map((product) => (
            <li key={product.id} className={product.active ? '' : 'off'}>
              <div className="product-main">
                <strong>{product.name}</strong>
                <span className="tag">{money(product.priceCents)}</span>
                {product.highlight && <em>{product.highlight}</em>}
              </div>
              <div className="row gap">
                <button
                  className="btn ghost"
                  onClick={async () => {
                    await api.updateProduct(product.id, { active: !product.active });
                    await refresh();
                  }}
                >
                  {product.active ? 'Tirar da live' : 'Voltar pra live'}
                </button>
                <button
                  className="btn ghost danger"
                  onClick={async () => {
                    await api.deleteProduct(product.id);
                    await refresh();
                  }}
                >
                  Excluir
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );

  if (compact) return body;
  return (
    <Card title="Produtos da live" subtitle="A IA narra nessa ordem, em loop, até você encerrar.">
      {body}
    </Card>
  );
}
