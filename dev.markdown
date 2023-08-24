---
title: BamOwl Dev
layout: default
---

<h1>Dev: Latest Posts</h1>

<ul style="list-style:none;">
  {% for post in site.posts %}
  {% if post.category == "dev"%}
  <li>
      <h2><a href="{{ post.url }}">{{ post.title }}</a><span class="date">{{post.date |  date: "%m/%d/%Y"}}</span></h2>      
  </li>
  {% endif %}
  {% endfor %}
</ul>