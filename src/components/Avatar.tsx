import { initials } from '../../shared/profile.ts';

const SIZES = { sm: 'h-8 w-8 text-xs', md: 'h-12 w-12 text-sm', lg: 'h-24 w-24 text-2xl' } as const;

/** A person's photo in a circle, or their initials when there is none. */
export function Avatar({ name, email, url, size = 'md' }: { name: string | null; email: string; url: string | null; size?: keyof typeof SIZES }) {
  const className = `${SIZES[size]} shrink-0 rounded-full`;
  if (url) return <img src={url} alt="" className={`${className} object-cover bg-gray-100`} />;
  return (
    <span className={`${className} inline-flex items-center justify-center bg-[#CC1F1F]/10 font-semibold text-[#CC1F1F]`} aria-hidden="true">
      {initials(name, email)}
    </span>
  );
}
