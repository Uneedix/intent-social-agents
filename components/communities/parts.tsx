'use client';
import { useState } from 'react';
import { UserRound } from 'lucide-react';
import s from './communities.module.css';

/** Image with a calm gradient fallback (offline, blocked or missing images never leave holes). */
export function Pic({ src, className, seed = '', initial = true }: { src: string | null | undefined; className: string; seed?: string; initial?: boolean }) {
  const [failed, setFailed] = useState(false);
  const hue = [...seed].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return <span className={className} style={{ ['--hue' as string]: hue }} aria-hidden="true">
    {src && !failed ? <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} /> : initial && <i className={s.picInitial}>{seed.trim().slice(0, 1).toUpperCase()}</i>}
  </span>;
}

export function Face({ src, name, size = 32 }: { src?: string | null; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  return <span className={s.face} style={{ width: size, height: size }} title={name}>
    {src && !failed ? <img src={src} alt="" onError={() => setFailed(true)} /> : <UserRound size={Math.round(size * .56)} />}
  </span>;
}

export function Stack({ faces, extra }: { faces: { src?: string | null; name: string }[]; extra?: string }) {
  return <span className={s.stack}>{faces.slice(0, 3).map((f, i) => <Face key={i} src={f.src} name={f.name} size={26} />)}{extra && <b>{extra}</b>}</span>;
}

export const ExampleBadge = ({ label }: { label: string }) => <span className={s.example}>{label}</span>;
