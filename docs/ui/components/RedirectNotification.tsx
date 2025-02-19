import { useRouter } from 'next/compat/router';
import { useEffect, useState, PropsWithChildren } from 'react';

import { Callout } from '~/ui/components/Callout';

type Props = PropsWithChildren<{
  showForQuery?: string;
}>;

export default function RedirectNotification({ showForQuery = 'redirected', children }: Props) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const referrer = document.referrer;
    const isFromSdk = referrer?.endsWith('/sdk') || referrer?.endsWith('/sdk/');

    if (router?.query) {
      setVisible(!isFromSdk && router.query.hasOwnProperty(showForQuery));
    }
  }, [router?.query]);

  if (visible) {
    return <Callout type="warning">{children}</Callout>;
  }

  return null;
}
