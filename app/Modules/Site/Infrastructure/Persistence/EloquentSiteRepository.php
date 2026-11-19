<?php

namespace App\Modules\Site\Infrastructure\Persistence;

use App\Models\Site as EloquentSite;
use App\Modules\Site\Domain\Entities\Site;
use App\Modules\Site\Domain\Repositories\SiteRepository;

class EloquentSiteRepository implements SiteRepository
{
    public function get(): ?Site
    {
        $model = EloquentSite::first();
        return $model ? $this->mapToEntity($model) : null;
    }

    public function save(Site $site, bool $updateLogo = true, bool $updateFavicon = true): Site
    {
        $model = EloquentSite::first() ?? new EloquentSite();
        
        $model->fill([
            'site_name' => $site->siteName(),
            'site_tagline' => $site->siteTagline(),
            'contact_email' => $site->contactEmail(),
            'contact_phone' => $site->contactPhone(),
            'address' => $site->address(),
            'social_links' => $site->socialLinks(),
            'description' => $site->description(),
        ]);
        
        if ($updateLogo) {
            $model->logo_url = $site->logoUrl();
        }
        if ($updateFavicon) {
            $model->favicon_url = $site->faviconUrl();
        }
        $model->save();

        return $this->mapToEntity($model);
    }

    private function mapToEntity(EloquentSite $model): Site
    {
        return new Site(
            $model->id,
            $model->site_name,
            $model->site_tagline,
            $model->contact_email,
            $model->contact_phone,
            $model->address,
            $model->logo_url,
            $model->favicon_url,
            $model->social_links,
            $model->description
        );
    }
}
