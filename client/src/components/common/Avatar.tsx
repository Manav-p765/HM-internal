import React, { useState } from 'react';

interface AvatarProps {
  name: string;
  url?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizes = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-9 h-9 text-xs',
  lg: 'w-12 h-12 text-sm',
  xl: 'w-20 h-20 text-2xl',
};

export function initials(name: string): string {
  // Words that start with a letter, so 'Erin Employee (Fake)' gives 'EE', not 'E('.
  const parts = name.trim().split(/\s+/).filter(word => /^\p{L}/u.test(word));
  if (parts.length === 0) return '?';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

// Round avatar: the image when there is one and it loads, otherwise the person's initials.
export const Avatar: React.FC<AvatarProps> = ({ name, url, size = 'sm', className = '' }) => {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = Boolean(url) && failedUrl !== url;

  return (
    <div
      className={`${sizes[size]} rounded-full overflow-hidden bg-[#5038F5]/10 text-[#5038F5] border border-[#DFE6F1] flex items-center justify-center font-bold shrink-0 ${className}`}
    >
      {showImage ? (
        <img
          src={url!}
          alt={name}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
          onError={() => setFailedUrl(url!)}
        />
      ) : (
        <span aria-hidden="true">{initials(name)}</span>
      )}
    </div>
  );
};
