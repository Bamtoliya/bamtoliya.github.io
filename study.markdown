---
title: Study
layout: default
---

<h1>Study: Latest Posts</h1>

<ul style="list-style:none;">
  {% for post in site.posts %}
  {% if post.category == "study"%}
  <li>
      <h2><a href="{{ post.url }}">{{ post.title }}</a><span class="date">{{post.date |  date: "%m/%d/%Y"}}</span></h2>      
  </li>
  {% endif %}
  {% endfor %}
</ul>