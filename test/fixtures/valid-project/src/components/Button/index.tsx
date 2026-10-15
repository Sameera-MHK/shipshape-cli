import type { ReactNode } from 'react';
import type { Size } from '../../types';

type Props = { children?: ReactNode; size?: Size };

export default function Button({ children }: Props) {
  return <button>{children}</button>;
}
