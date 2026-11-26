import { ArrowLeft } from 'lucide-react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { ProductReview } from './ProductReview';
import { Proposals } from './Proposals';
import { ModuleTabs } from '../../components/ModuleTabs';

/**
 * Purchase Manager: bid sell proposals (the first and default tab, decision of 17.11.2026) and products AI proposed
 * (the catalogue every match depends on).
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
          Home
        </Link>
        <h1 className="mt-1 text-xl sm:text-2xl font-semibold text-gray-900">Purchase Manager</h1>
      </div>
      <ModuleTabs label="Purchase Manager" tabs={tabs} />
      <Routes>
        <Route index element={<Proposals />} />
        <Route path="products" element={<ProductReview />} />
        {/* The address of the proposals before 17.11.2026, kept for old links. */}
        <Route path="proposals" element={<Navigate to="/purchase" replace />} />
      </Routes>
    </div>
  );
}
