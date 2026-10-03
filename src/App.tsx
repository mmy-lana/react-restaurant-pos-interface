import React, { useState } from 'react';

export default function App(): React.JSX.Element {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const categories = [
    { id: 'all', label: 'All Items' },
    { id: 'burgers', label: 'Burgers' },
    { id: 'sides', label: 'Sides & Fries' },
    { id: 'drinks', label: 'Beverages' },
    { id: 'desserts', label: 'Desserts' },
  ];

  return (
    <div className="flex flex-col h-screen w-screen bg-zinc-950 text-zinc-100 overflow-hidden font-sans">
      {/* Top Header */}
      <header className="h-14 border-b border-zinc-800 bg-zinc-900 px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
          <h1 className="font-bold text-sm tracking-wide uppercase text-zinc-200">Terminal 01 - Cashier Grid</h1>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono">
          <span className="bg-zinc-800 px-2.5 py-1 rounded text-zinc-300 border border-zinc-700">Table: Counter 04</span>
          <span className="bg-zinc-800 px-2.5 py-1 rounded text-zinc-300 border border-zinc-700">Cashier: Alex R.</span>
        </div>
      </header>

      {/* Main Split Body: Catalog (Left) + Ticket Rail (Right) */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left Section: Catalog Grid */}
        <main className="flex-1 flex flex-col min-w-0 border-r border-zinc-800 bg-zinc-950">
          {/* Category Filter Bar */}
          <div className="p-3 border-b border-zinc-800/80 bg-zinc-900/60 overflow-x-auto scrollbar-hide flex gap-2 shrink-0">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`min-h-[44px] px-4 py-2 rounded-lg text-sm font-medium transition-all shrink-0 active:scale-95 ${
                  activeCategory === cat.id
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 active:bg-zinc-700'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Catalog Items Surface */}
          <div className="flex-1 p-4 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {[
              { id: '1', name: 'Tactical Smash Burger', price: '$12.50', cat: 'burgers' },
              { id: '2', name: 'Double Bacon Stack', price: '$14.95', cat: 'burgers' },
              { id: '3', name: 'Truffle Parmesan Fries', price: '$6.50', cat: 'sides' },
              { id: '4', name: 'Crispy Onion Rings', price: '$5.50', cat: 'sides' },
              { id: '5', name: 'Cold Brew Nitro Coffee', price: '$4.75', cat: 'drinks' },
              { id: '6', name: 'Sparkling Mineral Water', price: '$3.00', cat: 'drinks' },
            ].map((item) => (
              <button
                key={item.id}
                className="min-h-[110px] p-3 rounded-xl bg-zinc-900 border border-zinc-800 flex flex-col justify-between text-left active:scale-95 transition-transform hover:border-zinc-700 focus:outline-none"
              >
                <span className="font-semibold text-sm text-zinc-200 leading-snug">{item.name}</span>
                <span className="font-mono text-emerald-400 font-bold tabular-nums text-base">{item.price}</span>
              </button>
            ))}
          </div>
        </main>

        {/* Right Section: Active Order Ticket */}
        <aside className="w-full md:w-96 lg:w-[420px] bg-zinc-900 flex flex-col shrink-0 border-t md:border-t-0 border-zinc-800">
          <div className="p-3 border-b border-zinc-800 flex items-center justify-between shrink-0">
            <h2 className="font-bold text-sm uppercase tracking-wide text-zinc-300">Current Order #1042</h2>
            <span className="text-xs font-mono text-zinc-400">Dine-In</span>
          </div>

          {/* Ticket Items Container */}
          <div className="flex-1 p-3 overflow-y-auto space-y-2">
            <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-between">
              <div className="min-w-0 pr-2">
                <p className="text-sm font-medium text-zinc-200 truncate">Tactical Smash Burger</p>
                <p className="text-xs text-zinc-400">Qty: 1 &bull; Mod: Extra Pickles</p>
              </div>
              <span className="font-mono text-sm tabular-nums font-semibold text-zinc-100 shrink-0">$12.50</span>
            </div>
            <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-between">
              <div className="min-w-0 pr-2">
                <p className="text-sm font-medium text-zinc-200 truncate">Truffle Parmesan Fries</p>
                <p className="text-xs text-zinc-400">Qty: 1 &bull; Standard</p>
              </div>
              <span className="font-mono text-sm tabular-nums font-semibold text-zinc-100 shrink-0">$6.50</span>
            </div>
          </div>

          {/* Ticket Financial Summary & Checkout CTA */}
          <div className="p-4 border-t border-zinc-800 bg-zinc-950/80 space-y-2 shrink-0 font-mono text-sm">
            <div className="flex justify-between text-zinc-400">
              <span>Subtotal</span>
              <span className="tabular-nums text-zinc-200">$19.00</span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>Tax (8.25%)</span>
              <span className="tabular-nums text-zinc-200">$1.57</span>
            </div>
            <div className="flex justify-between text-base font-bold text-zinc-100 pt-2 border-t border-zinc-800">
              <span>Payable</span>
              <span className="tabular-nums text-emerald-400">$20.57</span>
            </div>
            <button
              type="button"
              className="w-full min-h-[52px] mt-2 rounded-xl bg-emerald-600 font-bold uppercase tracking-wider text-white text-base shadow-lg shadow-emerald-950 active:scale-95 transition-all flex items-center justify-center"
            >
              Checkout / Tender
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
