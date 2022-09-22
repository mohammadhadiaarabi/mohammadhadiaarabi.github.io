---
layout: archive
title: "Publications"
permalink: /publications/
author_profile: true
---
2022
======
* Seyedmirzaei H, Shafie M, Kargar A, Golbahari A, Bijarchian M, Ahmadi S, et al. White matter tracts associated with alexithymia and emotion regulation: A diffusion MRI study. Journal of Affective Disorders. 2022;314:271-80.
[doi](https://doi.org/10.1016/j.jad.2022.07.039)





{% if author.googlescholar %}
  You can also find my articles on <u><a href="{{author.googlescholar}}">my Google Scholar profile</a>.</u>
{% endif %}

{% include base_path %}

{% for post in site.publications reversed %}
  {% include archive-single.html %}
{% endfor %}
