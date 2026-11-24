import { useEffect, useMemo, useState } from 'react';
import { Building2, Plus, Save, Search, Trash2 } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  COMMON_INCOTERMS,
  COUNTRIES,
  CURRENCIES,
  DEFAULT_DOCUMENTS,
  DOCUMENTS,
  INCOTERMS,
  INCOTERM_NAMES,
  PAYMENT_FROM,
  PRICE_UNITS,
  QUANTITY_UNITS,
  cleanContract,
  contractTotal,
  emptyDelivery,
  emptyParty,
  formatCn,
  isEu,
  lineTotal,
  money,
  paymentText,
  prefillFromCompany,
  type CnHit,
  type CompanyHit,
  type Contract,
  type ContractInput,
  type ContractSetup,
  type Draft,
  type Delivery,
  type Party,
  type Payment,
  type ProductLine,
  type ProductOption,
  type Problem,
} from '../../../shared/contractsApi.ts';
import { Button } from '../../components/Button';
import { Select, Textarea } from '../../components/Field';
import { Input } from '../../components/Input';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { CONTRACTS_API, useSetup } from './common';
import { Section } from './ui';

const today = () => new Date().toISOString().slice(0, 10);

const emptyLine = (): ProductLine => ({ name: '', productId: null, cnCode: '', notes: '', quantity: NaN, unit: 'KG', unitPrice: NaN, priceUnit: 'KG' });

function blank(owner: string): ContractInput {
  return {
    type: 'S',
    submissionDate: today(),
    ownerEmail: owner,
    companyId: null,
    party: emptyParty(),
    currency: 'EUR',
    products: [emptyLine()],
    delivery: emptyDelivery(),
    payment: { prepaymentPercent: 100, days: 0, from: 'delivery', factoring: false, notes: '' },
    documents: [...DEFAULT_DOCUMENTS],
  };
}

const restoreLine = (l: Partial<ProductLine>): ProductLine => ({
  ...emptyLine(),
  ...l,
  cnCode: l.cnCode ?? '',
  notes: l.notes ?? '',
  quantity: typeof l.quantity === 'number' ? l.quantity : NaN,
  unitPrice: typeof l.unitPrice === 'number' ? l.unitPrice : NaN,
});

function fromContract(c: Contract): ContractInput {
  const form: ContractInput = { type: c.type, submissionDate: c.submissionDate, ownerEmail: c.ownerEmail, companyId: c.companyId, currency: c.currency, ...c.data };
  return { ...form, products: form.products.map(restoreLine) };
}

/** A saved draft back in the form (JSON keeps empty numbers as null). */
function fromDraft(d: Draft, owner: string): ContractInput {
  const base = blank(d.ownerEmail || owner);
  const data = d.data as Partial<ContractInput>;
  return {
    ...base,
    ...data,
    ownerEmail: d.ownerEmail || owner,
    party: { ...base.party, ...data.party },
    delivery: { ...base.delivery, ...data.delivery },
    payment: {
      ...base.payment,
      ...data.payment,
      prepaymentPercent: typeof data.payment?.prepaymentPercent === 'number' ? data.payment.prepaymentPercent : base.payment.prepaymentPercent,
      days: typeof data.payment?.days === 'number' ? data.payment.days : base.payment.days,
    },
    products: data.products?.length ? data.products.map(restoreLine) : base.products,
    documents: data.documents ?? base.documents,
  };
}

const FROM_LABEL: Record<Payment['from'], string> = { delivery: 'after delivery', collection: 'after collection', invoice: 'from the invoice date' };
const numberValue = (n: number) => (Number.isFinite(n) ? String(n) : '');
const toNumber = (s: string) => (s.trim() === '' ? NaN : Number(s.replace(',', '.').replace(/\s+/g, '')));
const sameNumber = (a: number, b: number) => a === b || (Number.isNaN(a) && Number.isNaN(b));

/**
 * A number field that keeps what the person types ("12," or "0,5") while the form holds the parsed number, so a
 * decimal comma or point is not lost halfway through typing. A new value from outside (a draft, a reset) replaces the text.
 */
function NumberInput({ value, onValue, ...props }: Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange'> & { value: number; onValue: (n: number) => void }) {
  const [field, setField] = useState({ text: numberValue(value), value });
  let text = field.text;
  if (!sameNumber(field.value, value)) {
    text = numberValue(value);
    setField({ text, value });
  }
  return (
    <Input
      {...props}
      value={text}
      onChange={(e) => {
        const next = toNumber(e.target.value);
        setField({ text: e.target.value, value: next });
        onValue(next);
      }}
    />
  );
}

/** Debounced search in the module's lists (companies, products, CN codes). */
function useSearch<T>(view: 'companies' | 'products' | 'cn', q: string, key: 'companies' | 'products' | 'codes'): T[] {
  const [found, setFound] = useState<{ q: string; hits: T[] }>({ q: '', hits: [] });
  const term = q.trim();
  useEffect(() => {
    if (term.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api<Record<string, T[]>>(`${CONTRACTS_API}&view=${view}&q=${encodeURIComponent(term)}`, { signal: controller.signal })
        .then((r) => setFound({ q: term, hits: r[key] ?? [] }))
        .catch(() => undefined);
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [view, term, key]);
  return term.length >= 2 && found.q === term ? found.hits : [];
}

function CountrySelect({ id, label, value, onChange, error }: { id: string; label: string; value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <div>
      <Select id={id} label={label} value={value} onChange={(e) => onChange(e.target.value)} className="text-base sm:text-sm">
        <option value="">Choose…</option>
        {COUNTRIES.map(([code, name]) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </Select>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function CompanySearch({ onPick }: { onPick: (hit: CompanyHit) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const hits = useSearch<CompanyHit>('companies', q, 'companies');
  return (
    <div className="relative">
      <Input
        aria-label="Find the company"
        placeholder="Find the company by name or VAT ID (fills in the details)"
        leftIcon={<Search size={16} />}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="text-base sm:text-sm"
      />
      {open && hits.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full max-h-72 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {hits.map((hit) => (
            <li key={hit.companyId}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 min-h-11 hover:bg-gray-50"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(hit);
                  setQ('');
                  setOpen(false);
                }}
              >
                <span className="block text-sm font-medium text-gray-900">{hit.name}</span>
                <span className="block text-xs text-gray-500">
                  {[hit.vatId, hit.country, hit.last ? 'details from its last contract' : hit.intranet ? 'details from the intranet' : 'name only'].filter(Boolean).join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** CN code: type digits or words from the product name; the list shows products with a known code and the nomenclature. */
function CnInput({ value, productName, error, showLabel, onChange }: { value: string; productName: string; error?: string; showLabel: boolean; onChange: (code: string) => void }) {
  const [text, setText] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const shown = text ?? (value ? formatCn(value) : '');
  // Without own text, an empty field suggests codes for the product name.
  const query = text ?? (value ? '' : productName);
  const hits = useSearch<CnHit>('cn', open ? query : '', 'codes');
  return (
    <div className="relative">
      <Input
        label={showLabel ? 'CN code' : undefined}
        aria-label="CN code"
        placeholder="Code or product"
        value={shown}
        error={error}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          if (/^[0-9 .]*$/.test(e.target.value)) onChange(e.target.value.replace(/[^0-9]/g, ''));
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => {
          setOpen(false);
          setText(null);
        }, 150)}
        className="text-base sm:text-sm"
      />
      {open && hits.length > 0 && (
        <ul className="absolute z-10 mt-1 w-80 max-w-[90vw] max-h-72 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {hits.map((hit) => (
            <li key={`${hit.kind}-${hit.code}-${hit.label}`}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 min-h-11 hover:bg-gray-50"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(hit.code);
                  setText(null);
                  setOpen(false);
                }}
              >
                <span className="block text-sm font-medium text-gray-900 tabular-nums">{formatCn(hit.code)}</span>
                <span className="block text-xs text-gray-500 line-clamp-2">{hit.kind === 'product' ? `Used for: ${hit.label}` : hit.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProductRow({
  line,
  index,
  currency,
  errors,
  onChange,
  onRemove,
}: {
  line: ProductLine;
  index: number;
  currency: string;
  errors: Record<string, string>;
  onChange: (line: ProductLine) => void;
  onRemove?: () => void;
}) {
  const hits = useSearch<ProductOption>('products', line.productId ? '' : line.name, 'products');
  const total = lineTotal(line);
  const listId = `products-${index}`;
  const err = (f: string) => errors[`products.${index}.${f}`];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-12 gap-3 items-start border-b border-gray-100 pb-4 last:border-0 last:pb-0">
      <div className="col-span-2 sm:col-span-4">
        <Input
          label={index === 0 ? 'Product' : undefined}
          aria-label="Product"
          list={listId}
          value={line.name}
          error={err('name')}
          onChange={(e) => {
            const hit = hits.find((h) => h.name === e.target.value);
            onChange({ ...line, name: e.target.value, productId: hit ? hit.id : null, cnCode: hit?.cnCode && !line.cnCode ? hit.cnCode : line.cnCode });
          }}
          className="text-base sm:text-sm"
        />
        <datalist id={listId}>
          {hits.map((h) => (
            <option key={h.id} value={h.name} />
          ))}
        </datalist>
      </div>
      <div className="sm:col-span-2">
        <CnInput value={line.cnCode} productName={line.name} error={err('cnCode')} showLabel={index === 0} onChange={(cnCode) => onChange({ ...line, cnCode })} />
      </div>
      <div className="sm:col-span-2">
        <NumberInput label={index === 0 ? 'Quantity' : undefined} aria-label="Quantity" inputMode="decimal" value={line.quantity} error={err('quantity')}
          onValue={(n) => onChange({ ...line, quantity: n })} className="text-base sm:text-sm" />
      </div>
      <div className="sm:col-span-1">
        <Select label={index === 0 ? 'Unit' : undefined} aria-label="Unit" value={line.unit}
          onChange={(e) => {
            const unit = e.target.value as ProductLine['unit'];
            const priceUnit = unit === 'PCS' ? (line.priceUnit === '1000PCS' ? '1000PCS' : 'PCS') : unit;
            onChange({ ...line, unit, priceUnit });
          }} className="text-base sm:text-sm">
          {QUANTITY_UNITS.map((u) => <option key={u}>{u}</option>)}
        </Select>
      </div>
      <div className="sm:col-span-2">
        <NumberInput label={index === 0 ? `Price (${currency})` : undefined} aria-label="Unit price" inputMode="decimal" value={line.unitPrice} error={err('unitPrice')}
          onValue={(n) => onChange({ ...line, unitPrice: n })} className="text-base sm:text-sm" />
      </div>
      <div className="sm:col-span-1">
        <Select label={index === 0 ? 'Per' : undefined} aria-label="Price per" value={line.priceUnit}
          onChange={(e) => onChange({ ...line, priceUnit: e.target.value as ProductLine['priceUnit'] })} className="text-base sm:text-sm">
          {PRICE_UNITS.map((u) => <option key={u} value={u}>{u === '1000PCS' ? '1000 PCS' : u}</option>)}
        </Select>
      </div>
      <div className="col-span-2 sm:col-span-12 flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="flex-1">
          <Input aria-label="Product notes" placeholder="Notes for this product (grade, packaging, specification…)" maxLength={500} value={line.notes}
            onChange={(e) => onChange({ ...line, notes: e.target.value })} className="text-base sm:text-sm" />
        </div>
        <div className="flex items-center justify-end gap-2 sm:min-w-40">
          <span className={`text-sm ${total === null ? 'text-red-600' : 'text-gray-900 font-medium'}`}>
            {total === null ? 'Units do not match' : money(total, currency)}
          </span>
          {onRemove && (
            <button type="button" aria-label="Remove product" onClick={onRemove} className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50">
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function ContractForm() {
  const setup = useSetup() as ContractSetup;
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const defaultOwner = setup.owners.some((o) => o.email === setup.me.email) ? setup.me.email : (setup.owners[0]?.email ?? setup.me.email);
  const [form, setForm] = useState<ContractInput>(() => blank(defaultOwner));
  const [draftId, setDraftId] = useState<string | null>(id ? null : searchParams.get('draft'));
  const [loaded, setLoaded] = useState(!id && !draftId);
  const [savingDraft, setSavingDraft] = useState(false);
  const [returnComment, setReturnComment] = useState<string | null>(null);
  const [numberPreview, setNumberPreview] = useState(id ?? setup.numberPreview);
  const [moreIncoterms, setMoreIncoterms] = useState(false);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    api<{ contract: Contract }>(`${CONTRACTS_API}&view=one&id=${encodeURIComponent(id)}`)
      .then(({ contract }) => {
        setForm(fromContract(contract));
        setReturnComment(contract.returnComment);
        setMoreIncoterms(!COMMON_INCOTERMS.includes(contract.data.delivery.incoterm));
        setLoaded(true);
      })
      .catch((e: Error) => toast.error('The contract could not be opened', e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (id || !draftId || loaded) return;
    api<{ draft: Draft }>(`${CONTRACTS_API}&view=draft&id=${encodeURIComponent(draftId)}`)
      .then(({ draft }) => {
        const restored = fromDraft(draft, defaultOwner);
        setForm(restored);
        setMoreIncoterms(Boolean(restored.delivery.incoterm) && !COMMON_INCOTERMS.includes(restored.delivery.incoterm));
        setLoaded(true);
      })
      .catch((e: Error) => {
        toast.error('The draft could not be opened', e.message);
        setDraftId(null);
        setLoaded(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, draftId]);

  // The number the contract would get now (type, owner's initials, year of the contract date).
  const year = form.submissionDate.slice(0, 4);
  useEffect(() => {
    if (id) return;
    const controller = new AbortController();
    api<ContractSetup>(`${CONTRACTS_API}&view=setup&type=${form.type}&owner=${encodeURIComponent(form.ownerEmail)}&year=${year}`, { signal: controller.signal })
      .then((s) => setNumberPreview(s.numberPreview))
      .catch(() => undefined);
    return () => controller.abort();
  }, [id, form.type, form.ownerEmail, year]);

  const errors = useMemo(() => Object.fromEntries(problems.map((p) => [p.field, p.message])), [problems]);
  const total = contractTotal(form.products);
  const sale = form.type === 'S';
  const partyRole = sale ? 'Buyer' : 'Supplier';

  const set = <K extends keyof ContractInput>(key: K, value: ContractInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setParty = (patch: Partial<Party>) => setForm((f) => ({ ...f, party: { ...f.party, ...patch } }));
  const setDelivery = (patch: Partial<Delivery>) => setForm((f) => ({ ...f, delivery: { ...f.delivery, ...patch } }));
  const setPayment = (patch: Partial<Payment>) => setForm((f) => ({ ...f, payment: { ...f.payment, ...patch } }));
  const setLine = (i: number, line: ProductLine) => setForm((f) => ({ ...f, products: f.products.map((l, j) => (j === i ? line : l)) }));

  function pickCompany(hit: CompanyHit) {
    const { party, delivery } = prefillFromCompany(hit);
    setForm((f) => ({ ...f, companyId: hit.companyId, party, delivery: delivery ? { ...delivery, dateFrom: f.delivery.dateFrom, dateTo: f.delivery.dateTo } : f.delivery }));
    if (delivery && !COMMON_INCOTERMS.includes(delivery.incoterm)) setMoreIncoterms(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const { contract, problems: found } = cleanContract(form, today());
    setProblems(found);
    if (found.length) {
      toast.error('Check the contract', found.length === 1 ? found[0].message : `${found.length} fields need attention, marked in red.`);
      return;
    }
    setSaving(true);
    try {
      const { contract: saved } = await api<{ contract: Contract }>(CONTRACTS_API, {
        method: 'POST',
        body: id ? { action: 'update', id, contract } : { action: 'create', contract, ...(draftId ? { draftId } : {}) },
      });
      toast.success(id ? 'Contract sent again' : `Contract ${saved.id} generated`, 'Administration got an e-mail to accept it.');
      navigate(`/contracts/${encodeURIComponent(saved.id)}`);
    } catch (error) {
      toast.error('The contract was not saved', (error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function saveDraft() {
    setSavingDraft(true);
    try {
      const { draft } = await api<{ draft: Draft }>(CONTRACTS_API, { method: 'POST', body: { action: 'saveDraft', id: draftId ?? undefined, contract: form } });
      setDraftId(draft.id);
      if (!draftId) navigate(`/contracts/new?draft=${draft.id}`, { replace: true });
      toast.success('Draft saved', 'You will find it under My contracts.');
    } catch (error) {
      toast.error('The draft was not saved', (error as Error).message);
    } finally {
      setSavingDraft(false);
    }
  }

  if (!loaded) return <p className="text-sm text-gray-500">Loading…</p>;
  const p = form.party;
  const d = form.delivery;
  const pay = form.payment;
  const vatNeeded = p.country === 'PL' || isEu(p.country);
  const showIncoterms = moreIncoterms ? INCOTERMS : COMMON_INCOTERMS;

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {returnComment && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span className="font-semibold">Returned for corrections:</span> {returnComment}
        </p>
      )}

      <Section title={id ? `Correct contract ${id}` : 'New contract'} aside={!id && numberPreview ? <span className="text-xs text-gray-500">Number: {numberPreview} (final when saved)</span> : undefined}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</span>
            <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50" role="radiogroup" aria-label="Contract type">
              {(['S', 'P'] as const).map((t) => (
                <button key={t} type="button" role="radio" aria-checked={form.type === t} disabled={Boolean(id)}
                  onClick={() => set('type', t)}
                  className={`flex-1 min-h-10 rounded-md px-3 text-sm font-medium ${form.type === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'} disabled:cursor-not-allowed`}>
                  {t === 'S' ? 'Sales' : 'Purchase'}
                </button>
              ))}
            </div>
          </div>
          <Input label="Contract date" type="date" max={today()} value={form.submissionDate} error={errors.submissionDate}
            onChange={(e) => set('submissionDate', e.target.value)} className="text-base sm:text-sm" />
          {setup.owners.length > 1 && !id ? (
            <Select id="owner" label="Trader" value={form.ownerEmail} onChange={(e) => set('ownerEmail', e.target.value)} className="text-base sm:text-sm">
              {setup.owners.map((o) => <option key={o.email} value={o.email}>{o.name}</option>)}
            </Select>
          ) : (
            <Input label="Trader" value={setup.owners.find((o) => o.email === form.ownerEmail)?.name ?? form.ownerEmail} disabled />
          )}
          <Select id="currency" label="Currency" value={form.currency} onChange={(e) => set('currency', e.target.value as ContractInput['currency'])} className="text-base sm:text-sm">
            {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </Select>
        </div>
      </Section>

      <Section title={partyRole} aside={form.companyId ? <span className="inline-flex items-center gap-1 text-xs text-gray-500"><Building2 size={14} /> From the company database</span> : undefined}>
        <div className="space-y-4">
          <CompanySearch onPick={pickCompany} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Company name" value={p.companyName} error={errors['party.companyName']}
              onChange={(e) => setParty({ companyName: e.target.value })} className="text-base sm:text-sm" />
            <Input label={vatNeeded ? 'VAT ID' : 'VAT ID (optional outside the EU)'} value={p.vatId} error={errors['party.vatId']}
              onChange={(e) => setParty({ vatId: e.target.value })} className="text-base sm:text-sm" />
            <Input label="Street" value={p.street} error={errors['party.street']} onChange={(e) => setParty({ street: e.target.value })} className="text-base sm:text-sm" />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Postal code" value={p.postalCode} error={errors['party.postalCode']} onChange={(e) => setParty({ postalCode: e.target.value })} className="text-base sm:text-sm" />
              <Input label="City" value={p.city} error={errors['party.city']} onChange={(e) => setParty({ city: e.target.value })} className="text-base sm:text-sm" />
            </div>
            <CountrySelect id="party-country" label="Country" value={p.country} error={errors['party.country']} onChange={(country) => setParty({ country })} />
            <div />
            <Input label="Contact first name" value={p.contactFirstName} error={errors['party.contactFirstName']} onChange={(e) => setParty({ contactFirstName: e.target.value })} className="text-base sm:text-sm" />
            <Input label="Contact last name" value={p.contactLastName} error={errors['party.contactLastName']} onChange={(e) => setParty({ contactLastName: e.target.value })} className="text-base sm:text-sm" />
            <Input label="Position (optional)" value={p.contactPosition} onChange={(e) => setParty({ contactPosition: e.target.value })} className="text-base sm:text-sm" />
            <Input label="E-mail" type="email" value={p.email} error={errors['party.email']} onChange={(e) => setParty({ email: e.target.value })} className="text-base sm:text-sm" />
            <Input label="Phone" type="tel" value={p.phone} error={errors['party.phone']} onChange={(e) => setParty({ phone: e.target.value })} className="text-base sm:text-sm" />
          </div>
        </div>
      </Section>

      <Section title="Goods" aside={<span className="text-xs text-gray-500">Prices in {form.currency}</span>}>
        <div className="space-y-4">
          {errors.products && <p className="text-sm text-red-600">{errors.products}</p>}
          {form.products.map((line, i) => (
            <div key={i}>
              <ProductRow line={line} index={i} currency={form.currency} errors={errors} onChange={(l) => setLine(i, l)}
                onRemove={form.products.length > 1 ? () => set('products', form.products.filter((_, j) => j !== i)) : undefined} />
              {errors[`products.${i}.priceUnit`] && <p className="mt-1 text-xs text-red-600">{errors[`products.${i}.priceUnit`]}</p>}
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <Button type="button" variant="secondary" className="min-h-11 sm:min-h-0 inline-flex items-center gap-1.5" onClick={() => set('products', [...form.products, emptyLine()])}>
              <Plus size={16} /> Add product
            </Button>
            <p className="text-base font-semibold text-gray-900">Total net: {money(total, form.currency)}</p>
          </div>
        </div>
      </Section>

      <Section title="Delivery">
        <div className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Incoterms 2020</span>
            <div className="flex flex-wrap gap-2">
              {showIncoterms.map((term) => (
                <button key={term} type="button" title={INCOTERM_NAMES[term]} aria-pressed={d.incoterm === term}
                  onClick={() => setDelivery({ incoterm: term, byAir: term === 'CIP' ? d.byAir : false })}
                  className={`min-h-11 sm:min-h-9 rounded-lg border px-3 text-sm font-medium ${d.incoterm === term ? 'border-[#CC1F1F] bg-red-50 text-[#CC1F1F]' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                  {term}
                </button>
              ))}
              {!moreIncoterms && (
                <button type="button" onClick={() => setMoreIncoterms(true)} className="min-h-11 sm:min-h-9 px-2 text-sm text-gray-500 hover:text-gray-800">
                  More…
                </button>
              )}
            </div>
            <p className="text-xs text-gray-500">{INCOTERM_NAMES[d.incoterm]}</p>
            {d.incoterm === 'CIP' && (
              <label className="inline-flex items-center gap-2 min-h-11 sm:min-h-0 text-sm text-gray-700">
                <input type="checkbox" className="h-4 w-4 accent-[#CC1F1F]" checked={d.byAir} onChange={(e) => setDelivery({ byAir: e.target.checked })} />
                By air
              </label>
            )}
          </div>
          <div className="flex justify-end">
            <button type="button" className="text-sm text-[#CC1F1F] hover:underline min-h-11 sm:min-h-0"
              onClick={() => setDelivery({ street: p.street, postalCode: p.postalCode, city: p.city, country: p.country })}>
              Same address as the {partyRole.toLowerCase()}
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Street" value={d.street} error={errors['delivery.street']} onChange={(e) => setDelivery({ street: e.target.value })} className="text-base sm:text-sm" />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Postal code" value={d.postalCode} error={errors['delivery.postalCode']} onChange={(e) => setDelivery({ postalCode: e.target.value })} className="text-base sm:text-sm" />
              <Input label="City" value={d.city} error={errors['delivery.city']} onChange={(e) => setDelivery({ city: e.target.value })} className="text-base sm:text-sm" />
            </div>
            <CountrySelect id="delivery-country" label="Country" value={d.country} error={errors['delivery.country']} onChange={(country) => setDelivery({ country })} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Delivery from" type="date" value={d.dateFrom} error={errors['delivery.dateFrom']}
                onChange={(e) => setDelivery({ dateFrom: e.target.value, dateTo: d.dateTo && d.dateTo >= e.target.value ? d.dateTo : e.target.value })} className="text-base sm:text-sm" />
              <Input label="Delivery to" type="date" min={d.dateFrom} value={d.dateTo} error={errors['delivery.dateTo']} onChange={(e) => setDelivery({ dateTo: e.target.value })} className="text-base sm:text-sm" />
            </div>
            <Input label="Delivery contact (optional)" value={d.contactName} onChange={(e) => setDelivery({ contactName: e.target.value })} className="text-base sm:text-sm" />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Contact e-mail" type="email" value={d.contactEmail} error={errors['delivery.contactEmail']} onChange={(e) => setDelivery({ contactEmail: e.target.value })} className="text-base sm:text-sm" />
              <Input label="Contact phone" type="tel" value={d.contactPhone} onChange={(e) => setDelivery({ contactPhone: e.target.value })} className="text-base sm:text-sm" />
            </div>
          </div>
          <Textarea id="instructions" label="Instructions (optional)" rows={2} value={d.instructions} onChange={(e) => setDelivery({ instructions: e.target.value })}
            placeholder="E.g. delivery hours, pallets, labelling" className="text-base sm:text-sm" />
        </div>
      </Section>

      <Section title="Payment">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <NumberInput label="Prepayment before shipment (%)" inputMode="numeric" value={pay.prepaymentPercent} error={errors['payment.prepaymentPercent']}
              onValue={(n) => setPayment({ prepaymentPercent: n })} className="text-base sm:text-sm" />
            {pay.prepaymentPercent < 100 && (
              <>
                <NumberInput label={`The rest (${100 - (pay.prepaymentPercent || 0)}%) within days`} inputMode="numeric" value={pay.days} error={errors['payment.days']}
                  onValue={(n) => setPayment({ days: n })} className="text-base sm:text-sm" />
                <Select id="payment-from" label="Counted" value={pay.from} onChange={(e) => setPayment({ from: e.target.value as Payment['from'] })} className="text-base sm:text-sm">
                  {PAYMENT_FROM.map((f) => <option key={f} value={f}>{FROM_LABEL[f]}</option>)}
                </Select>
              </>
            )}
          </div>
          {Number.isFinite(pay.prepaymentPercent) && pay.prepaymentPercent >= 0 && pay.prepaymentPercent <= 100 && (pay.prepaymentPercent >= 100 || Number.isFinite(pay.days)) && (
            <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">In the contract: {paymentText(pay)}</p>
          )}
          <label className="flex items-start gap-3 min-h-11 sm:min-h-0 text-sm text-gray-700">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#CC1F1F]" checked={pay.factoring} onChange={(e) => setPayment({ factoring: e.target.checked })} />
            <span>
              <span className="font-medium text-gray-900">Factoring</span>
              <span className="block text-xs text-gray-500">The client pays through a factoring company; the contract gets the factoring clause. Orders and finance see it.</span>
            </span>
          </label>
          <Textarea id="payment-notes" label="Payment notes (optional)" rows={2} value={pay.notes} onChange={(e) => setPayment({ notes: e.target.value })} className="text-base sm:text-sm" />
        </div>
      </Section>

      <Section title="Required documents">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {DOCUMENTS.map((doc) => (
            <label key={doc} className="inline-flex items-center gap-2 min-h-11 sm:min-h-0 text-sm text-gray-700">
              <input type="checkbox" className="h-4 w-4 accent-[#CC1F1F]" checked={form.documents.includes(doc)}
                onChange={(e) => set('documents', e.target.checked ? DOCUMENTS.filter((x) => x === doc || form.documents.includes(x)) : form.documents.filter((x) => x !== doc))} />
              {doc}
            </label>
          ))}
        </div>
        {errors.documents && <p className="mt-2 text-xs text-red-600">{errors.documents}</p>}
      </Section>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 safe-bottom">
        <Button type="button" variant="secondary" className="min-h-11" onClick={() => navigate(id ? `/contracts/${encodeURIComponent(id)}` : '/contracts')}>
          Cancel
        </Button>
        {!id && (
          <Button type="button" variant="secondary" className="min-h-11 inline-flex items-center justify-center gap-1.5" isLoading={savingDraft} onClick={saveDraft}>
            <Save size={16} /> Save draft
          </Button>
        )}
        <Button type="submit" className="min-h-11" isLoading={saving}>
          {id ? 'Send again to administration' : 'Generate and send to administration'}
        </Button>
      </div>
    </form>
  );
}
