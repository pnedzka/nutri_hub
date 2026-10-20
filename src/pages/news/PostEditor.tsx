import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ChevronLeft, ChevronRight, ImagePlus, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/Button';
import { Card, CardBody } from '../../components/Card';
import { Textarea } from '../../components/Field';
import { Input } from '../../components/Input';
import { api } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../lib/toast';
import { BODY_MAX, IMAGES_MAX, TITLE_MAX } from '../../../shared/news';
import type { NewsPostDetail, NewsPostInput, ShownImage, UploadResponse } from '../../../shared/newsApi';
import { ErrorNote, Loading } from '../leave/ui';
import { useApi } from '../leave/useApi';
import { preparePhoto } from './images';
import { PageHeader } from './ui';

function PhotoGrid({ images, onChange }: { images: ShownImage[]; onChange: (images: ShownImage[]) => void }) {
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
          {i === 0 && <span className="absolute left-2 top-2 rounded-full bg-[#CC1F1F] px-2 py-0.5 text-xs font-medium text-white">Cover</span>}
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

function EditorForm({ post }: { post?: NewsPostDetail }) {
  const navigate = useNavigate();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(post?.title ?? '');
  const [body, setBody] = useState(post?.body ?? '');
  const [images, setImages] = useState<ShownImage[]>(post?.images ?? []);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Previews of new photos are object URLs: free them when leaving the page.
  const previews = useRef<string[]>([]);
  useEffect(() => () => previews.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const addPhotos = async (files: File[]) => {
    const room = IMAGES_MAX - images.length;
    if (files.length > room) toast.error('Too many photos', `A post can have at most ${IMAGES_MAX} photos.`);
    const chosen = files.slice(0, Math.max(0, room));
    if (!chosen.length || !supabase) return;
    setUploading({ done: 0, total: chosen.length });
    try {
      const { uploads } = await api<UploadResponse>('/api/news/upload', { method: 'POST', body: { types: chosen.map(() => 'image/jpeg') } });
      for (const [i, file] of chosen.entries()) {
        const photo = await preparePhoto(file);
        const { path, token } = uploads[i];
        const { error: uploadError } = await supabase.storage.from('intranet').uploadToSignedUrl(path, token, photo.blob, { contentType: 'image/jpeg' });
        if (uploadError) throw new Error(`${file.name}: ${uploadError.message}`);
        const url = URL.createObjectURL(photo.blob);
        previews.current.push(url);
        setImages((current) => [...current, { path, width: photo.width, height: photo.height, url }]);
        setUploading({ done: i + 1, total: chosen.length });
      }
    } catch (e) {
      toast.error('Could not add photos', (e as Error).message);
    } finally {
      setUploading(null);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const input: NewsPostInput = { title, body, images: images.map(({ path, width, height }) => ({ path, width, height })) };
      if (post) {
        await api(`/api/news/post?id=${encodeURIComponent(post.id)}`, { method: 'PUT', body: input });
        toast.success('Post saved');
        navigate(`/news/${post.id}`, { replace: true });
      } else {
        const { id } = await api<{ id: string }>('/api/news', { method: 'POST', body: input });
        toast.success('Post published', 'Everyone with access to News gets an e-mail.');
        navigate(`/news/${id}`, { replace: true });
      }
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <Card>
        <CardBody className="space-y-5 py-5">
          <Input id="news-title" label="Title" required maxLength={TITLE_MAX} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Welcome, Anna!" />
          <Textarea
            id="news-body"
            label="Text"
            rows={10}
            maxLength={BODY_MAX}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            hint="Leave an empty line between paragraphs. Links (https://…) become clickable."
          />
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Photos ({images.length}/{IMAGES_MAX})
              </p>
              <Button
                type="button"
                variant="secondary"
                className="min-h-11 sm:min-h-0"
                isLoading={Boolean(uploading)}
                disabled={images.length >= IMAGES_MAX}
                onClick={() => fileInput.current?.click()}
              >
                <ImagePlus size={16} />
                {uploading ? `Adding ${uploading.done + 1} of ${uploading.total}…` : 'Add photos'}
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
            {images.length > 0 ? (
              <PhotoGrid images={images} onChange={setImages} />
            ) : (
              <p className="text-sm text-gray-500">No photos. The first photo is the cover in the list of news.</p>
            )}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4">
            <Button type="button" variant="ghost" className="min-h-11 sm:min-h-0" onClick={() => navigate(post ? `/news/${post.id}` : '/news')}>
              Cancel
            </Button>
            <Button type="submit" className="min-h-11 sm:min-h-0" isLoading={busy} disabled={Boolean(uploading)}>
              {post ? 'Save' : 'Publish'}
            </Button>
          </div>
        </CardBody>
      </Card>
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
      <PageHeader back={id ? { to: `/news/${id}`, label: 'Post' } : { to: '/news', label: 'News' }} title={id ? 'Edit post' : 'New post'} />
      {id ? <EditExisting id={id} /> : <EditorForm />}
    </div>
  );
}
