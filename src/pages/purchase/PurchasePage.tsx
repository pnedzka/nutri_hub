import { Navigate, Route, Routes } from 'react-router-dom';
import { ProductReview } from './ProductReview';
import { Proposals } from './Proposals';
import { ModuleTabs } from '../../components/ModuleTabs';
import { PageHeader } from '../../components/PageHeader';

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
      <PageHeader title="Purchase Manager" />
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
