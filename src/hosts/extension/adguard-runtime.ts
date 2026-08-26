// Packaging removes AdGuard's cosmetic bootstrap from this entry. The
// refreshable cosmetic layer is owned by adguard-content.ts.
import '@adguard/tswebextension/mv3/content-script';

document.documentElement.setAttribute('data-card-master-adguard-runtime', '');
