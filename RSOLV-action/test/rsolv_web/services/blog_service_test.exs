defmodule RsolvWeb.Services.BlogServiceTest do
  use Rsolv.DataCase, async: false

  alias RsolvWeb.Services.BlogService

  describe "get_post/1" do
    test "returns properly structured blog post when it exists" do
      # Try to get any existing blog post from the blog directory
      posts = BlogService.list_posts()
      
      if length(posts) > 0 do
        # Use the first available post for testing
        test_post = hd(posts)
        assert {:ok, post} = BlogService.get_post(test_post.slug)
        
        # Verify structure without depending on specific content
        assert post.slug == test_post.slug
        assert is_binary(post.title)
        assert is_binary(post.content)
        assert is_binary(post.html)
        assert is_list(post.tags)
        assert post.status in ["draft", "published"]
      else
        # If no posts exist, just verify the function handles missing posts correctly
        assert {:error, :not_found} = BlogService.get_post("nonexistent-post")
      end
    end

    test "returns error when post does not exist" do
      assert {:error, :not_found} = BlogService.get_post("nonexistent-post")
    end

    test "sanitizes slug input" do
      assert {:error, :not_found} = BlogService.get_post("../../../etc/passwd")
      assert {:error, :not_found} = BlogService.get_post("post with spaces")
    end
  end

  describe "list_posts/0" do
    test "returns list of blog posts with proper structure" do
      posts = BlogService.list_posts()
      
      assert is_list(posts)
      
      # Only check structure if posts exist
      if length(posts) > 0 do
        post = hd(posts)
        assert Map.has_key?(post, :title)
        assert Map.has_key?(post, :slug)
        assert Map.has_key?(post, :excerpt)
        assert Map.has_key?(post, :published_at)
        assert Map.has_key?(post, :status)
      end
    end

    test "returns posts sorted by published date (newest first)" do
      posts = BlogService.list_posts()
      
      dates = Enum.map(posts, & &1.published_at)
      sorted_dates = Enum.sort(dates, {:desc, Date})
      
      assert dates == sorted_dates
    end
  end

  describe "generate_rss/0" do
    test "generates valid RSS XML" do
      rss = BlogService.generate_rss()
      
      assert is_binary(rss)
      assert rss =~ "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
      assert rss =~ "<rss version=\"2.0\">"
      assert rss =~ "<channel>"
      assert rss =~ "RSOLV Blog"
    end

    test "RSS feed structure is valid" do
      rss = BlogService.generate_rss()
      
      # RSS should have valid structure regardless of content
      assert rss =~ "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
      assert rss =~ "<rss version=\"2.0\">"
      assert rss =~ "<channel>"
      assert rss =~ "RSOLV Blog"
      assert rss =~ "<title>RSOLV Blog</title>"
      assert rss =~ "<link>https://rsolv.dev/blog</link>"
      assert rss =~ "<description>AI Security Insights and Vulnerability Analysis</description>"
    end
  end

  describe "parse_frontmatter/1" do
    test "extracts YAML frontmatter from markdown" do
      content = """
      ---
      title: "Test Post"
      excerpt: "Test excerpt"
      tags: ["test", "example"]
      published_at: "2025-06-07"
      ---
      
      # Test Content
      
      This is test content.
      """
      
      assert {:ok, metadata, markdown} = BlogService.parse_frontmatter(content)
      
      assert metadata["title"] == "Test Post"
      assert metadata["excerpt"] == "Test excerpt"
      assert metadata["tags"] == ["test", "example"]
      assert metadata["published_at"] == "2025-06-07"
      assert markdown =~ "# Test Content"
    end

    test "handles content without frontmatter" do
      content = """
      # Regular Markdown
      
      No frontmatter here.
      """
      
      assert {:ok, %{}, markdown} = BlogService.parse_frontmatter(content)
      assert markdown =~ "# Regular Markdown"
    end

    test "extracts status field from frontmatter" do
      content = """
      ---
      title: "Draft Post"
      status: "draft"
      ---
      
      This is a draft post.
      """
      
      assert {:ok, metadata, _markdown} = BlogService.parse_frontmatter(content)
      assert metadata["status"] == "draft"
    end
  end

  describe "post visibility" do
    test "list_posts/0 returns a list of posts" do
      posts = BlogService.list_posts()
      
      # Should return a list (may be empty if no posts exist)
      assert is_list(posts)
      
      # If posts exist, verify they have required fields
      if length(posts) > 0 do
        post = hd(posts)
        assert Map.has_key?(post, :title)
        assert Map.has_key?(post, :slug)
        assert Map.has_key?(post, :status)
      end
    end
  end
end