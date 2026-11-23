import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Bold, ChevronLeft, ChevronRight, Heading2, Image as ImageIcon, ImagePlus, Italic, Link2, List, Minus, Send, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/Button';
import { Card, CardBody } from '../../components/Card';
import { Select, Textarea } from '../../components/Field';
import { Input } from '../../components/Input';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../lib/toast';
import { BODY_MAX, IMAGES_MAX, SUMMARY_MAX, TITLE_MAX } from '../../../shared/news';
import type { AuthorsResponse, NewsPostDetail, NewsPostInput, PostStatus, ShownImage, UploadResponse } from '../../../shared/newsApi';
import { ErrorNote, Loading } from '../leave/ui';
import { useApi } from '../leave/useApi';
import { preparePhoto } from './images';
import { DraftBadge, FormattedText, PageHeader } from './ui';

function PhotoGrid({ images, onChange, coverChosen }: { images: ShownImage[]; onChange: (images: ShownImage[]) => void; coverChosen: boolean }) {
  const move = (from: number, to: number) => {
    const next = [...images];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };
  const control = 'flex h-11 w-11 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80';
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {images.map((image, i) => (
        <li key={image.path} className="relative overflow-hidden rounded-lg bg-gray-100">
          <img src={image.url} alt={`Photo ${i + 1}`} className="aspect-square w-full object-cover" />
          {i === 0 && !coverChosen && <span className="absolute left-2 top-2 rounded-full bg-[#CC1F1F] px-2 py-0.5 text-xs font-medium text-white">Cover</span>}
          <button type="button" className={`${control} absolute right-1.5 top-1.5`} aria-label={`Remove photo ${i + 1}`} onClick={() => onChange(images.filter((_, j) => j !== i))}>
            <X size={16} />
          </button>
          <div className="absolute bottom-1.5 left-1.5 right-1.5 flex justify-between">
            <button type="button" className={`${control} ${i === 0 ? 'invisible' : ''}`} aria-label={`Move photo ${i + 1} earlier`} onClick={() => move(i, i - 1)}>
              <ChevronLeft size={16} />
            </button>
            <button type="button" className={`${control} ${i === images.length - 1 ? 'invisible' : ''}`} aria-label={`Move photo ${i + 1} later`} onClick={() => move(i, i + 1)}>
              <ChevronRight size={16} />
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Uploads photos (made smaller in the browser) straight to storage; returns them as they are shown. */
async function uploadPhotos(files: File[], onProgress: (done: number) => void, previews: string[]): Promise<ShownImage[]> {
  if (!files.length || !supabase) return [];
  const { uploads } = await api<UploadResponse>('/api/news/upload', { method: 'POST', body: { types: files.map(() => 'image/jpeg') } });
  const result: ShownImage[] = [];
  for (const [i, file] of files.entries()) {
    const photo = await preparePhoto(file);
    const { path, token } = uploads[i];
    const { error: uploadError } = await supabase.storage.from('intranet').uploadToSignedUrl(path, token, photo.blob, { contentType: 'image/jpeg' });
    if (uploadError) throw new Error(`${file.name}: ${uploadError.message}`);
    const url = URL.createObjectURL(photo.blob);
    previews.push(url);
    result.push({ path, width: photo.width, height: photo.height, url });
    onProgress(i + 1);
  }
  return result;
}

type Mark = { label: string; title: string; icon: typeof Bold; apply: (selected: string) => { text: string; select?: [number, number] }; line?: true };

const MARKS: Mark[] = [
  { label: 'Heading', title: 'Heading (## at the start of a line)', icon: Heading2, line: true, apply: (t) => ({ text: `## ${t || 'Heading'}` }) },
  { label: 'Bold', title: 'Bold (**text**)', icon: Bold, apply: (t) => ({ text: `**${t || 'bold text'}**`, select: [2, 2 + (t || 'bold text').length] }) },
  { label: 'Italic', title: 'Italic (_text_)', icon: Italic, apply: (t) => ({ text: `_${t || 'italic text'}_`, select: [1, 1 + (t || 'italic text').length] }) },
  {
    label: 'List',
    title: 'List (- at the start of a line)',
    icon: List,
    line: true,
    apply: (t) => ({ text: (t || 'item').split('\n').map((l) => `- ${l.replace(/^\s*[-*•]\s+/, '')}`).join('\n') }),
  },
  {
    label: 'Link',
    title: 'Link ([text](https://…))',
    icon: Link2,
    apply: (t) => {
      const label = t || 'link text';
      return { text: `[${label}](https://)`, select: [label.length + 3, label.length + 11] };
    },
  },
  { label: 'Divider', title: 'Dividing line (---)', icon: Minus, line: true, apply: () => ({ text: '---' }) },
];

function BodyEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const area = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);
  const apply = (mark: Mark) => {
    const el = area.current;
    if (!el) return;
    let start = el.selectionStart;
    let end = el.selectionEnd;
    if (mark.line) {
      // Line marks work on whole lines, on a line of their own.
      start = value.lastIndexOf('\n', start - 1) + 1;
      const next = value.indexOf('\n', end);
      end = next === -1 ? value.length : next;
    }
    const { text, select } = mark.apply(value.slice(start, end));
    const before = value.slice(0, start);
    const after = value.slice(end);
    const pad = mark.line && before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : '';
    const padAfter = mark.line && after && !after.startsWith('\n\n') ? (after.startsWith('\n') ? '\n' : '\n\n') : '';
    onChange(before + pad + text + padAfter + after);
    const at = start + pad.length;
    requestAnimationFrame(() => {
      el.focus();
      if (select) el.setSelectionRange(at + select[0], at + select[1]);
      else el.setSelectionRange(at + text.length, at + text.length);
    });
  };
  const tab = (active: boolean) =>
    `min-h-11 sm:min-h-0 rounded-md px-3 py-1.5 text-sm font-medium ${active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`;
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor="news-body" className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Text
        </label>
        <div className="inline-flex rounded-lg bg-gray-100 p-0.5" role="tablist" aria-label="Text view">
          <button type="button" role="tab" aria-selected={!preview} className={tab(!preview)} onClick={() => setPreview(false)}>
            Write
          </button>
          <button type="button" role="tab" aria-selected={preview} className={tab(preview)} onClick={() => setPreview(true)}>
            Preview
          </button>
        </div>
      </div>
      {preview ? (
        <div className="min-h-[240px] rounded-lg border border-gray-200 bg-white px-4 py-3">
          {value.trim() ? <FormattedText text={value} className="text-[15px] leading-relaxed text-gray-800" /> : <p className="text-sm text-gray-400">Nothing to preview yet.</p>}
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white focus-within:ring-2 focus-within:ring-[#CC1F1F] focus-within:border-transparent">
          <div className="flex flex-wrap gap-0.5 border-b border-gray-100 px-1.5 py-1" role="toolbar" aria-label="Formatting">
            {MARKS.map((mark) => (
              <button
                key={mark.label}
                type="button"
                title={mark.title}
                aria-label={mark.label}
                onClick={() => apply(mark)}
                className="flex h-11 w-11 sm:h-8 sm:w-8 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              >
                <mark.icon size={16} />
              </button>
            ))}
          </div>
          <textarea
            ref={area}
            id="news-body"
            rows={14}
            maxLength={BODY_MAX}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="block w-full resize-y rounded-b-lg border-0 bg-transparent px-3 py-2.5 text-base sm:text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
            placeholder="Write the post. Leave an empty line between paragraphs."
          />
        </div>
      )}
      <p className="text-xs text-gray-500">
        Use the buttons, or type <code>## Heading</code>, <code>**bold**</code>, <code>_italic_</code>, <code>- list item</code>, <code>[text](https://…)</code>. Links
        (https://…) become clickable.
      </p>
    </div>
  );
}

function EditorForm({ post }: { post?: NewsPostDetail }) {
  const navigate = useNavigate();
  const toast = useToast();
  const me = useAuth((s) => s.user);
  const { data: authorList } = useApi<AuthorsResponse>('/api/news?view=authors');
  const fileInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(post?.title ?? '');
  const [summary, setSummary] = useState(post?.summary ?? '');
  const [body, setBody] = useState(post?.body ?? '');
  const [authorId, setAuthorId] = useState(post?.author ? post.author.id : (me?.id ?? ''));
  const [cover, setCover] = useState<ShownImage | null>(post?.cover ?? null);
  const [images, setImages] = useState<ShownImage[]>(post?.images ?? []);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [busy, setBusy] = useState<PostStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Previews of new photos are object URLs: free them when leaving the page.
  const previews = useRef<string[]>([]);
  useEffect(() => () => previews.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const authors = authorList?.authors ?? [];
  // A former author (no longer with access to News, or imported without an account) stays selectable on their post.
  const authorOptions = post?.author && !authors.some((a) => a.id === post.author!.id) ? [post.author, ...authors] : authors;

  const addPhotos = async (files: File[]) => {
    const room = IMAGES_MAX - images.length;
    if (files.length > room) toast.error('Too many photos', `A post can have at most ${IMAGES_MAX} photos.`);
    const chosen = files.slice(0, Math.max(0, room));
    if (!chosen.length) return;
    setUploading({ done: 0, total: chosen.length });
    try {
      const added = await uploadPhotos(chosen, (done) => setUploading({ done, total: chosen.length }), previews.current);
      setImages((current) => [...current, ...added]);
    } catch (e) {
      toast.error('Could not add photos', (e as Error).message);
    } finally {
      setUploading(null);
    }
  };

  const chooseCover = async (file: File | undefined) => {
    if (!file) return;
    setUploading({ done: 0, total: 1 });
    try {
      const [added] = await uploadPhotos([file], () => undefined, previews.current);
      if (added) setCover(added);
    } catch (e) {
      toast.error('Could not add the cover', (e as Error).message);
    } finally {
      setUploading(null);
    }
  };

  const save = async (status: PostStatus) => {
    setBusy(status);
    setError(null);
    try {
      const strip = ({ path, width, height }: ShownImage) => ({ path, width, height });
      const input: NewsPostInput = { title, summary, body, authorId, status, cover: cover ? strip(cover) : null, images: images.map(strip) };
      const firstPublish = status === 'published' && !post?.publishedAt;
      if (post) {
        await api(`/api/news/post?id=${encodeURIComponent(post.id)}`, { method: 'PUT', body: input });
        toast.success(status === 'draft' ? 'Draft saved' : 'Post saved', firstPublish ? 'Everyone with access to News gets an e-mail.' : undefined);
        navigate(`/news/${post.id}`, { replace: true });
      } else {
        const { id } = await api<{ id: string }>('/api/news', { method: 'POST', body: input });
        toast.success(status === 'draft' ? 'Draft saved' : 'Post published', status === 'published' ? 'Everyone with access to News gets an e-mail.' : 'Only editors see it until you publish it.');
        navigate(`/news/${id}`, { replace: true });
      }
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void save(post?.status ?? 'published');
  };

  const shownCover = cover ?? images[0] ?? null;
  const isDraft = !post || post.status === 'draft';

  return (
    <form onSubmit={submit} className="space-y-4">
      <Card>
        <CardBody className="space-y-5 py-5">
          <Input id="news-title" label="Title" required maxLength={TITLE_MAX} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Welcome, Anna!" />
          <div className="grid gap-5 sm:grid-cols-2">
            <Select id="news-author" label="Author" value={authorId} onChange={(e) => setAuthorId(e.target.value)} disabled={!authorOptions.length}>
              {!authorOptions.length && <option value={authorId}>{me?.name || me?.email || 'You'}</option>}
              {authorOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.id === me?.id ? ' (you)' : ''}
                </option>
              ))}
            </Select>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</span>
              <p className="flex min-h-11 items-center gap-2 text-sm text-gray-700">
                {isDraft ? (
                  <>
                    <DraftBadge /> Only editors see it.
                  </>
                ) : (
                  'Published: everyone with access to News sees it.'
                )}
              </p>
            </div>
          </div>
          <Textarea
            id="news-summary"
            label="Summary (optional)"
            rows={2}
            maxLength={SUMMARY_MAX}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            hint={`Shown in the list of news and in the e-mail (${summary.length}/${SUMMARY_MAX}). Without it, the start of the text is used.`}
          />
          <BodyEditor value={body} onChange={setBody} />
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-5 py-5">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Cover</p>
              <div className="flex flex-wrap gap-2">
                {cover && (
                  <Button type="button" variant="ghost" className="min-h-11 sm:min-h-0" onClick={() => setCover(null)}>
                    <X size={16} />
                    Remove cover
                  </Button>
                )}
                <Button type="button" variant="secondary" className="min-h-11 sm:min-h-0" disabled={Boolean(uploading)} onClick={() => coverInput.current?.click()}>
                  <ImageIcon size={16} />
                  {cover ? 'Change cover' : 'Add a cover'}
                </Button>
              </div>
              <input
                ref={coverInput}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  void chooseCover(file);
                }}
              />
            </div>
            {shownCover ? (
              <div className="relative overflow-hidden rounded-lg bg-gray-100 sm:max-w-md">
                <img src={shownCover.url} alt="Cover" className="aspect-[16/9] w-full object-cover" />
                {!cover && <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">First photo</span>}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No cover. Without one, the first photo below is used.</p>
            )}
          </div>
          <div className="space-y-3 border-t border-gray-100 pt-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Photos ({images.length}/{IMAGES_MAX})
              </p>
              <Button
                type="button"
                variant="secondary"
                className="min-h-11 sm:min-h-0"
                isLoading={Boolean(uploading)}
                disabled={images.length >= IMAGES_MAX || Boolean(uploading)}
                onClick={() => fileInput.current?.click()}
              >
                <ImagePlus size={16} />
                {uploading ? `Adding ${Math.min(uploading.done + 1, uploading.total)} of ${uploading.total}…` : 'Add photos'}
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = '';
                  void addPhotos(files);
                }}
              />
            </div>
            {images.length > 0 ? <PhotoGrid images={images} onChange={setImages} coverChosen={Boolean(cover)} /> : <p className="text-sm text-gray-500">No photos. Photos are shown as a gallery under the text.</p>}
          </div>
        </CardBody>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" className="min-h-11 sm:min-h-0" onClick={() => navigate(post ? `/news/${post.id}` : '/news/manage')}>
          Cancel
        </Button>
        {isDraft ? (
          <>
            <Button type="button" variant="secondary" className="min-h-11 sm:min-h-0" isLoading={busy === 'draft'} disabled={Boolean(uploading) || Boolean(busy)} onClick={() => save('draft')}>
              Save draft
            </Button>
            <Button type="button" className="min-h-11 sm:min-h-0" isLoading={busy === 'published'} disabled={Boolean(uploading) || Boolean(busy)} onClick={() => save('published')}>
              <Send size={16} />
              Publish
            </Button>
          </>
        ) : (
          <>
            <Button type="button" variant="secondary" className="min-h-11 sm:min-h-0" isLoading={busy === 'draft'} disabled={Boolean(uploading) || Boolean(busy)} onClick={() => save('draft')}>
              Move to drafts
            </Button>
            <Button type="submit" className="min-h-11 sm:min-h-0" isLoading={busy === 'published'} disabled={Boolean(uploading) || Boolean(busy)}>
              Save
            </Button>
          </>
        )}
      </div>
    </form>
  );
}

function EditExisting({ id }: { id: string }) {
  const { data: post, error } = useApi<NewsPostDetail>(`/api/news/post?id=${encodeURIComponent(id)}`);
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!post) return <Loading />;
  if (!post.canEdit) return <ErrorNote>Only the author or an administrator can edit this post.</ErrorNote>;
  return <EditorForm post={post} />;
}

export function PostEditor({ id }: { id?: string }) {
  return (
    <div className="space-y-6">
      <PageHeader back={id ? { to: `/news/${id}`, label: 'Post' } : { to: '/news/manage', label: 'Manager' }} title={id ? 'Edit post' : 'New post'} />
      {id ? <EditExisting id={id} /> : <EditorForm />}
    </div>
  );
}
