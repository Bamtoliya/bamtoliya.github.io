---
title: BamOwl Diary
layout: default
---

<h1>Diary: Latest Posts</h1>

<ul style="list-style:none;">
  {% for post in site.posts %}
  {% if post.category == "diary"%}
  <li>
      <h2><a href="{{ post.url }}">{{ post.title }}</a><span class="diary">{{post.date |  date: "%m/%d/%Y"}}</span></h2>      
  </li>
  {% endif %}
  {% endfor %}
</ul>