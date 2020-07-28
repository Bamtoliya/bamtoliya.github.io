---
title: BamOwl Dev
layout: default
---

<h1>Yotube: Latest Posts</h1>

<ul style="list-style:none;">
  {% for post in site.posts %}
  {% if post.category == "youtube"%}
  <li>
      <h2><a href="{{ post.url }}">{{ post.title }}</a><span class="date">{{post.date |  date: "%m/%d/%Y"}}</span></h2>      
  </li>
  {% endif %}
  {% endfor %}
</ul>

<section class="introduction">
    <p>This website built for personal portfolio and blog.</p>
    <p>이 웹사이트는 개인 블로그와 포트폴리오 용도로 만들어졌습니다.</p>
</section>