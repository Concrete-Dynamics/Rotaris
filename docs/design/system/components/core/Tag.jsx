import React from 'react';

export function Tag({ kind = 'neutral', children, className = '' }) {
  return <span className={['tag', 'tag-' + kind, className].filter(Boolean).join(' ')}>{children}</span>;
}
