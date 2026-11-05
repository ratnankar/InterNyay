package com.internyay.scraper;

import java.util.List;

// The district court websites, one per district: the Judges on Leave page of each is scraped, and the same websites give
// the district cause lists (DistrictSiteUrls takes each site's address from here)
public final class DistrictLeaveUrls {

    // Only static data, no need to create an object
    private DistrictLeaveUrls() {
    }

    // Court complex, district name and the Judges on Leave page url (the site's address is that url without its last page)
    public record DistrictInfo(
            String court,
            String district,
            String url
    ) {
    }

    // Used by the daily judge leave scraper
    public static final List<DistrictInfo> URLS = List.of(

            new DistrictInfo(
                    "Saket",
                    "South",
                    "https://southdelhi.dcourts.gov.in/judges-on-leave/"
            ),

            new DistrictInfo(
                    "Saket",
                    "South East",
                    "https://southeastdelhi.dcourts.gov.in/judges-on-leave/"
            ),

            new DistrictInfo(
                    "Dwarka",
                    "South West",
                    "https://southwestdelhi.dcourts.gov.in/judges-on-leave/"
            ),

            new DistrictInfo(
                    "Patiala House",
                    "New Delhi",
                    "https://newdelhi.dcourts.gov.in/judges-on-leave/"
            ),

            new DistrictInfo(
                    "Tis Hazari",
                    "Central",
                    "https://centraldelhi.dcourts.gov.in/judges-on-leave/"
            ),

            new DistrictInfo(
                    "Tis Hazari",
                    "West",
                    "https://westdelhi.dcourts.gov.in/judges-on-leave/"
            ),

            new DistrictInfo(
                    "Karkardooma",
                    "East",
                    "https://eastdelhi.dcourts.gov.in/judges-on-leave/"
            ),

            new DistrictInfo(
                    "Karkardooma",
                    "North East",
                    "https://northeast.dcourts.gov.in/judges-on-leave/"
            ),

            new DistrictInfo(
                    "Karkardooma",
                    "Shahdara",
                    "https://shahdara.dcourts.gov.in/judges-on-leave/"
            ),

            new DistrictInfo(
                    "Rohini",
                    "North",
                    "https://northdelhi.dcourts.gov.in/judges-on-leave/"
            ),

            new DistrictInfo(
                    "Rohini",
                    "North West",
                    "https://rohini.dcourts.gov.in/judges-on-leave/"
            ),

            // Haryana, not Delhi. Its website is read for judges on leave and for the cause list like the Delhi ones
            new DistrictInfo(
                    "Gurugram",
                    "Gurugram",
                    "https://gurugram.dcourts.gov.in/judges-on-leave/"
            )
    );
}
