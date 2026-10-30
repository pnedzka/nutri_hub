import { ArrowLeft } from 'lucide-react';
import { Link, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { ProductReview } from './ProductReview';
import { Proposals } from './Proposals';

/**
 * Purchase Manager: bid sell proposals (the default screen, decision of 30.10.2026) and products AI proposed (the
 * catalogue every match depends on). /purchase/proposals is the old address of the proposals and still works.
 */
export function PurchasePage() {
  const tabs = [
    { to: '/purchase', label: 'Bid sell proposals' },
    { to: '/purchase/products', label: 'Products to review' },
  ];
  return (
    <div className="space-y-6">
      <div>
        <Link to="/" className="inline-flex items-center gap-1 min-h-11 sm:min-h-0 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft size={16} />
          All apps
        </Link>
        <h1 className="mt-1 text-xl sm:text-2xl font-semibold text-gray-900">Purchase Manager</h1>
      </div>
      <nav className="-mx-4 sm:mx-0 overflow-x-auto border-b border-gray-200" aria-label="Purchase Manager">
        <div className="flex gap-1 px-4 sm:px-0">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end
              className={({ isActive }) =>
                `inline-flex items-center gap-2 whitespace-nowrap min-h-11 px-3 border-b-2 -mb-px text-sm font-medium ${
                  isActive ? 'border-[#CC1F1F] text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-800'
                }`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </div>
      </nav>
      <Routes>
        <Route index element={<Proposals />} />
        <Route path="products" element={<ProductReview />} />
        <Route path="proposals" element={<Navigate to="/purchase" replace />} />
      </Routes>
    </div>
  );
}
