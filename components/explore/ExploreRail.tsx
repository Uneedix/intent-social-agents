'use client';
import { useState } from 'react';
import { ArrowRight, EyeOff, Search, UserX, MessageCircle } from 'lucide-react';
import { useT } from '../I18n';
import { exploreTrends, allTopics, demoPeople, verifiedHandles, onlineHandles } from '../../lib/explore-demo';
import { ExMenu, Verified, compactNum, type ExploreState } from './shared';
import s from './explore.module.css';

export interface ExploreRailProps {
  people: [name: string, handle: string, avatar: string][];
  following: string[];
  onFollow: (handle: string) => void;
  muted: string[];
  state: ExploreState;
  onSearch: (q: string) => void;
  onMessage: (handle: string, name: string, avatar: string) => void;
  onDiscover: () => void;
  toast: (msg: string) => void;
}

export default function ExploreRail(props: ExploreRailProps) {
  const t = useT();
  const { state: st } = props;
  const [moreT, setMoreT] = useState(false);
  const [moreP, setMoreP] = useState(false);
  const source = moreT ? allTopics : exploreTrends;
  const trends = source.filter(x => !st.hiddenTopics.includes(x.tag.toLowerCase()));
  const extra = demoPeople.filter(d => !props.people.some(p => p[1] === d.handle)).map(d => [d.name, d.handle, d.avatar] as [string, string, string]);
  const people = (moreP ? [...props.people, ...extra] : props.people).filter(p => !st.hiddenPeople.includes(p[1]) && !props.muted.includes(p[1]));
  return <div className={s.rail}>
    <section className={s.card + ' ' + s.widget} aria-labelledby="ex-trending-h">
      <div className={s.wh}><h2 id="ex-trending-h">{t('Trending now')}</h2><button type="button" onClick={() => setMoreT(!moreT)} aria-expanded={moreT}>{t(moreT ? 'Show less' : 'See all')}</button></div>
      {trends.map(x => <div className={s.trend} key={x.tag}>
        <button type="button" className={s.trendMain} onClick={() => props.onSearch('#' + x.tag)}>
          <span className={s.rank}>{source.indexOf(x) + 1}</span>
          <span className={s.trendTxt}><b>{x.tag}</b><small>{t('{n} posts', { n: compactNum(x.posts) })}</small></span>
          <img className={s.thumb} src={x.image} alt="" loading="lazy" />
        </button>
        <ExMenu label={t('More options')} items={[
          { label: t('Search #{t}', { t: x.tag }), icon: <Search size={16} />, onClick: () => props.onSearch('#' + x.tag) },
          { label: t('Not interested in this topic'), icon: <EyeOff size={16} />, onClick: () => { st.setHiddenTopics([...st.hiddenTopics, x.tag.toLowerCase()]); props.toast(t('You’ll see fewer posts about #{t}', { t: x.tag })); } },
        ]} />
      </div>)}
      {!trends.length && <p className={s.note}>{t('Nothing here yet.')}</p>}
    </section>
    <section className={s.card + ' ' + s.widget} aria-labelledby="ex-suggested-h">
      <div className={s.wh}><h2 id="ex-suggested-h">{t('Suggested for you')}</h2><button type="button" onClick={() => setMoreP(!moreP)} aria-expanded={moreP}>{t(moreP ? 'Show less' : 'See all')}</button></div>
      {people.map(([name, handle, avatar]) => { const on = props.following.includes(handle); return <div className={s.person} key={handle}>
        <div className={s.personMain}>
          <span className={s.avwrap}><img src={avatar} alt="" />{onlineHandles.includes(handle) && <i className={s.online} aria-label={t('Online')} />}</span>
          <span className={s.personTxt}><b><span>{name}</span>{verifiedHandles.includes(handle) && <Verified size={15} />}</b><small>@{handle}</small></span>
        </div>
        <button type="button" className={s.follow + ' ' + s.outline} aria-pressed={on} onClick={() => props.onFollow(handle)}>{t(on ? 'Following|button' : 'Follow')}</button>
        <ExMenu vertical label={t('More options')} items={[
          { label: t('Message'), icon: <MessageCircle size={16} />, onClick: () => props.onMessage(handle, name, avatar) },
          { label: t('Hide suggestion'), icon: <UserX size={16} />, onClick: () => st.setHiddenPeople([...st.hiddenPeople, handle]) },
        ]} />
      </div>; })}
      {!people.length && <p className={s.note}>{t('No more suggestions right now.')}</p>}
    </section>
    <button type="button" className={s.card + ' ' + s.promo} onClick={props.onDiscover}>
      <span className={s.globe} aria-hidden />
      <span className={s.promoTxt}>{t('Discover new people, ideas and communities.')}</span>
      <span className={s.promoArrow} aria-hidden><ArrowRight size={18} /></span>
    </button>
  </div>;
}
