import type { Finding } from '../model/finding.js';
import type { PagePair } from '../model/page.js';
import { checkCanonical } from './canonical.js';
import type { CheckContext } from './context.js';
import { checkDescription } from './description.js';
import { checkIndexingDirectives } from './robots.js';
import { checkRedirectChain } from './redirects.js';
import { checkTargetStatus } from './status.js';
import { checkTitle } from './title.js';

export type { CheckContext } from './context.js';

export function checkPagePair(pair: PagePair, context: CheckContext): Finding[] {
  return [
    ...checkTargetStatus(pair, context),
    ...checkRedirectChain(pair, context),
    ...checkCanonical(pair, context),
    ...checkIndexingDirectives(pair),
    ...checkTitle(pair),
    ...checkDescription(pair),
  ];
}
