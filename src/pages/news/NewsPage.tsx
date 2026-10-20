import { Route, Routes, useParams } from 'react-router-dom';
import { Editors } from './Editors';
import { NewsList } from './NewsList';
import { PostEditor } from './PostEditor';
import { PostView } from './PostView';

function EditRoute() {
  const { id = '' } = useParams();
  return <PostEditor key={id} id={id} />;
}

function ViewRoute() {
  const { id = '' } = useParams();
  return <PostView key={id} id={id} />;
}

export function NewsPage() {
  return (
    <Routes>
      <Route index element={<NewsList />} />
      <Route path="new" element={<PostEditor />} />
      <Route path="editors" element={<Editors />} />
      <Route path=":id" element={<ViewRoute />} />
      <Route path=":id/edit" element={<EditRoute />} />
    </Routes>
  );
}
