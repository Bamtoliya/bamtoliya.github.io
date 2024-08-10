---
title: BamOwl Game
layout: default
---
<link rel="stylesheet" href="/assets/css/category.css">

<h1>Game: Latest Posts</h1>

<ul style="list-style:none;">
  {% for post in site.posts %}
  {% if post.category == "game"%}
  
  <li>
      <h2><a href="{{ post.url }}">{{ post.title }}</a><span class="date">{{post.date |  date: "%m/%d/%Y"}}</span></h2>      
  </li>
  {% for tag in post.tags %}
    <a href="/search/?q={{tag}}"><button class="tag-button" role="button">#{{ tag }}</button></a>
  {% endfor %}
  {% endif %}
  {% endfor %}
</ul>

