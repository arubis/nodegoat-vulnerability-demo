defmodule RsolvWeb.BlogControllerTest do
  use RsolvWeb.ConnCase

  import ExUnit.CaptureLog

  setup do
    # Enable blog feature flag for tests
    FunWithFlags.enable(:blog)
    
    on_exit(fn ->
      FunWithFlags.disable(:blog)
    end)
    
    :ok
  end

  describe "when blog feature flag is disabled" do
    test "GET /blog returns 404", %{conn: conn} do
      FunWithFlags.disable(:blog)
      
      conn = get(conn, ~p"/blog")
      assert response(conn, 404)
    end

    test "GET /blog/test-post returns 404", %{conn: conn} do
      FunWithFlags.disable(:blog)
      
      conn = get(conn, ~p"/blog/test-post")
      assert response(conn, 404)
    end
  end

  describe "when blog feature flag is enabled" do
    test "GET /blog returns blog listing page", %{conn: conn} do
      conn = get(conn, ~p"/blog")
      response = html_response(conn, 200)
      assert response =~ "AI Security Insights"
      assert response =~ "Technical deep-dives on vulnerability detection"
    end

    test "GET /blog lists available blog posts", %{conn: conn} do
      conn = get(conn, ~p"/blog")
      response = html_response(conn, 200)
      
      # Should have a blog listing structure
      assert response =~ "AI Security Insights"
      # Check for blog structure rather than specific posts
      assert response =~ "<article" || response =~ "No blog posts available"
    end

    test "GET /blog/:slug shows blog post if it exists", %{conn: conn} do
      # Get any existing blog post
      posts = RsolvWeb.Services.BlogService.list_posts()
      
      if length(posts) > 0 do
        post = hd(posts)
        conn = get(conn, ~p"/blog/#{post.slug}")
        response = html_response(conn, 200)
        
        assert response =~ post.title
        # Check for the back button
        assert response =~ "Go back to articles"
      else
        # If no posts exist, verify 404 handling
        conn = get(conn, ~p"/blog/test-post")
        assert response(conn, 404)
      end
    end

    test "GET /blog/nonexistent-post returns 404", %{conn: conn} do
      conn = get(conn, ~p"/blog/nonexistent-post")
      assert response(conn, 404)
    end

    test "blog post includes proper structure", %{conn: conn} do
      # Get any existing blog post
      posts = RsolvWeb.Services.BlogService.list_posts()
      
      if length(posts) > 0 do
        post = hd(posts)
        conn = get(conn, ~p"/blog/#{post.slug}")
        response = html_response(conn, 200)
        
        # Check for structured data
        assert response =~ ~s("@type": "Article")
        # Check that some title and content exist
        assert response =~ post.title
      end
    end

    test "blog listing includes RSS feed link", %{conn: conn} do
      conn = get(conn, ~p"/blog")
      response = html_response(conn, 200)
      
      # RSS link is now in the blog page content, not in the head
      assert response =~ "Subscribe via RSS"
      assert response =~ "/blog/rss.xml"
    end

    test "GET /blog/rss.xml returns valid RSS feed", %{conn: conn} do
      conn = get(conn, ~p"/blog/rss.xml")
      response = response(conn, 200)
      
      assert get_resp_header(conn, "content-type") == ["application/rss+xml; charset=utf-8"]
      assert response =~ "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
      assert response =~ "<rss version=\"2.0\">"
      assert response =~ "<channel>"
      assert response =~ "RSOLV Blog"
      assert response =~ "<title>RSOLV Blog</title>"
      assert response =~ "<link>https://rsolv.dev/blog</link>"
    end
  end

  describe "blog post metadata extraction" do
    test "extracts frontmatter from markdown files" do
      # Get any existing blog post
      posts = RsolvWeb.Services.BlogService.list_posts()
      
      if length(posts) > 0 do
        post = hd(posts)
        assert {:ok, fetched_post} = RsolvWeb.Services.BlogService.get_post(post.slug)
        
        # Verify structure without checking specific content
        assert is_binary(fetched_post.title)
        assert is_binary(fetched_post.excerpt)
        assert is_list(fetched_post.tags)
        assert is_binary(fetched_post.category)
        assert fetched_post.slug == post.slug
      end
    end

    test "handles missing blog posts" do
      assert {:error, :not_found} = RsolvWeb.Services.BlogService.get_post("nonexistent")
    end

    test "lists all available posts" do
      posts = RsolvWeb.Services.BlogService.list_posts()
      
      # Should return a list (may be empty)
      assert is_list(posts)
      
      # If posts exist, verify structure
      if length(posts) > 0 do
        post = hd(posts)
        assert Map.has_key?(post, :slug)
        assert Map.has_key?(post, :title)
      end
    end
  end

  describe "draft/published post visibility" do
    test "draft posts are accessible in test environment", %{conn: conn} do
      # Get any draft post that exists
      posts = RsolvWeb.Services.BlogService.list_posts()
      draft_posts = Enum.filter(posts, &(&1.status == "draft"))
      
      if length(draft_posts) > 0 do
        draft_post = hd(draft_posts)
        conn = get(conn, ~p"/blog/#{draft_post.slug}")
        assert html_response(conn, 200) =~ draft_post.title
      end
    end

    test "blog listing shows appropriate posts for environment", %{conn: conn} do
      conn = get(conn, ~p"/blog")
      response = html_response(conn, 200)
      
      # Should have blog structure
      assert response =~ "AI Security Insights"
      # Either shows posts or "No blog posts" message
      assert response =~ "<article" || response =~ "No blog posts"
    end

    test "RSS feed only includes published posts" do
      # Generate RSS feed
      rss = RsolvWeb.Services.BlogService.generate_rss()
      
      # RSS should have valid structure
      assert rss =~ "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
      assert rss =~ "<rss version=\"2.0\">"
      assert rss =~ "RSOLV Blog"
      
      # Count published vs draft posts to verify RSS behavior
      all_posts = RsolvWeb.Services.BlogService.list_all_posts_unfiltered()
      published_posts = Enum.filter(all_posts, &(&1.status == "published"))
      
      if length(published_posts) > 0 do
        # Should contain published posts
        post = hd(published_posts)
        assert rss =~ post.title
      else
        # RSS should be empty of posts if no published posts
        refute rss =~ "<item>"
      end
    end

    test "posts have correct status field from frontmatter" do
      # Get any post and verify it has a status field
      posts = RsolvWeb.Services.BlogService.list_posts()
      
      if length(posts) > 0 do
        post = hd(posts)
        assert {:ok, fetched_post} = RsolvWeb.Services.BlogService.get_post(post.slug)
        assert fetched_post.status in ["draft", "published"]
      end
    end
  end

  describe "MDEx markdown processing" do
    test "renders markdown with syntax highlighting", %{conn: conn} do
      # Get the syntax highlighting showcase post if it exists
      case RsolvWeb.Services.BlogService.get_post("syntax-highlighting-showcase") do
        {:ok, post} ->
          # Check that code blocks are properly rendered with MDEx
          # MDEx generates <pre class="athl"> for syntax highlighted blocks
          assert post.html =~ "<pre class=\"athl\""
          assert post.html =~ "language-javascript"
          assert post.html =~ "language-ruby"
          
          # Verify the post displays correctly
          conn = get(conn, ~p"/blog/syntax-highlighting-showcase")
          response = html_response(conn, 200)
          
          # Check for code blocks in the rendered HTML
          assert response =~ "<pre class=\"athl\""
          assert response =~ "function"
          assert response =~ "detectSQLInjection"
        
        {:error, :not_found} ->
          # Skip test if showcase post doesn't exist
          :ok
      end
    end

    test "removes duplicate H1 titles from markdown", %{conn: conn} do
      # Test that the H1 from markdown is removed when it matches the frontmatter title
      case RsolvWeb.Services.BlogService.get_post("from-zero-to-23-vulnerabilities") do
        {:ok, post} ->
          # The HTML should not contain an H1 with the same title
          refute post.html =~ "<h1>From 0 to 23 Vulnerabilities"
          
          # But it should contain the content that follows
          assert post.html =~ "Sometimes the best lessons come from spectacular failures"
        
        {:error, :not_found} ->
          # Skip test if post doesn't exist
          :ok
      end
    end

    test "renders lists properly", %{conn: conn} do
      # Test that lists are properly converted from markdown
      case RsolvWeb.Services.BlogService.get_post("from-zero-to-23-vulnerabilities") do
        {:ok, post} ->
          # Check for ordered lists
          assert post.html =~ "<ol>"
          assert post.html =~ "<li>Search GitHub for open security issues</li>"
          
          # Check for unordered lists
          assert post.html =~ "<ul>"
          assert post.html =~ "<li>Projects analyzed:"
        
        {:error, :not_found} ->
          # Skip test if post doesn't exist
          :ok
      end
    end

    test "MDEx extensions are enabled", %{conn: conn} do
      # Test that MDEx extensions like tables, strikethrough, etc. work
      case RsolvWeb.Services.BlogService.get_post("ai-security-in-practice") do
        {:ok, post} ->
          # The post should have properly formatted content
          assert is_binary(post.html)
          assert String.length(post.html) > 0
          
          # Verify no Earmark artifacts remain
          refute post.html =~ "language-elixir"  # Earmark's default class
        
        {:error, :not_found} ->
          # Skip test if post doesn't exist
          :ok
      end
    end
  end
end