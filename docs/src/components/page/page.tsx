import { $, component$, useHostElement } from '@builder.io/qwik';
import { Builder } from '../../layouts/builder/builder';
import { setHeadLinks, setHeadMeta, usePage } from '@builder.io/qwest';
import { SiteStore } from '../../main';

interface PageProps {
  store: SiteStore;
}

export const Page = component$((props: PageProps) => {
  return $(async () => {
    const hostElm = useHostElement();
    const page = await usePage(hostElm);

    if (page) {
      const attrs = page.attributes;
      const Layout = page.layout;
      const Content = page.content;

      setHeadMeta(hostElm, {
        title: attrs.title + ' - Qwik',
        description: attrs.description,
      });

      setHeadLinks(hostElm, [{ rel: 'canonical', href: page.url.href }]);

      return (
        <Layout store={props.store}>
          <Content store={props.store} />
        </Layout>
      );
    }

    return <Builder store={props.store} />;
  });
});
