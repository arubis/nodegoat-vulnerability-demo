defmodule RsolvWeb.FeedbackDashLiveTest do
  use RsolvWeb.LiveViewCase, async: true
  
  # Skip these tests - they use outdated routes and mock structures
  # The tests need to be rewritten to:
  # 1. Use correct route: /dashboard/feedback instead of /feedback-dashboard
  # 2. Use proper Phoenix.LiveViewTest instead of custom mocks
  # 3. Handle authentication for dashboard access
  @moduletag :skip

  describe "FeedbackDashLive connection tests" do
    test "establishes WebSocket connection successfully", %{conn: conn} do
      result = test_websocket_lifecycle(conn, "/feedback-dashboard", fn view ->
        assert view.module == RsolvWeb.FeedbackDashLive
        assert render(view) =~ "Feedback Dashboard"
      end)

      assert {:ok, _, _} = result
    end
    
    test "maintains connection during page interactions", %{conn: conn} do
      {:ok, view, _} = live(conn, "/feedback-dashboard")
      
      # Test that the view maintains connections during interactions
      assert view.module == RsolvWeb.FeedbackDashLive
      assert Process.alive?(view.pid)
      
      # Test various interactions
      assert view |> render_click(%{type: "filter", value: "all"}) =~ "Feedback Dashboard"
      assert view |> render_click(%{type: "filter", value: "feature"}) =~ "Feedback Dashboard"
      assert view |> render_click(%{type: "filter", value: "bug"}) =~ "Feedback Dashboard"
      
      # Verify process is still alive after multiple interactions
      assert Process.alive?(view.pid)
    end
  end
  
  describe "FeedbackDashLive data streaming" do
    test "receives real-time updates via WebSocket", %{conn: conn} do
      # First, connect to the dashboard
      {:ok, view, _} = live(conn, "/feedback-dashboard")
      
      # The initial count of feedback items
      initial_html = render(view)
      initial_count = count_feedback_items(initial_html)
      
      # Simulate adding new feedback from another "user"
      # This would be implemented by sending a message to the LiveView process
      # that would normally come from a PubSub broadcast
      send(view.pid, {:new_feedback, %{
        id: "test-123",
        type: "feature",
        content: "WebSocket test feedback",
        submitted_at: DateTime.utc_now() |> DateTime.to_string(),
        status: "pending"
      }})
      
      # Get updated HTML and count feedback items
      updated_html = render(view)
      updated_count = count_feedback_items(updated_html)
      
      # Verify the count increased by 1
      assert updated_count == initial_count + 1
      assert updated_html =~ "WebSocket test feedback"
    end
    
    test "filters update in real-time", %{conn: conn} do
      {:ok, view, _} = live(conn, "/feedback-dashboard")
      
      # First, apply a filter to show only feature requests
      _filtered_html = view |> render_click(%{type: "filter", value: "feature"})
      
      # Add a bug (which shouldn't appear due to filter)
      send(view.pid, {:new_feedback, %{
        id: "test-bug-123",
        type: "bug",
        content: "Bug that should be filtered",
        submitted_at: DateTime.utc_now() |> DateTime.to_string(),
        status: "pending"
      }})
      
      # Get updated HTML after adding a filtered-out item
      updated_html = render(view)
      
      # Bug should not be visible because of the filter
      refute updated_html =~ "Bug that should be filtered"
      
      # Now add a feature (which should appear despite filter)
      send(view.pid, {:new_feedback, %{
        id: "test-feature-123",
        type: "feature",
        content: "Feature that should appear",
        submitted_at: DateTime.utc_now() |> DateTime.to_string(),
        status: "pending"
      }})
      
      # Get updated HTML after adding a visible item
      updated_html = render(view)
      
      # Feature should be visible because it matches the filter
      assert updated_html =~ "Feature that should appear"
    end
  end
  
  describe "FeedbackDashLive performance tests" do
    test "measures WebSocket performance", %{conn: conn} do
      {:ok, metrics} = measure_websocket_performance(conn, "/feedback-dashboard", 3, fn view ->
        # Simulate different interactions to measure performance
        view |> render_click(%{type: "filter", value: "all"})
      end)
      
      # Assert on performance metrics
      assert metrics.connect_time < 1000 # Should connect in less than 1 second
      assert metrics.avg_event_time < 500 # Average event should process in less than 500ms
      assert metrics.disconnect_time < 1000 # Should disconnect in less than 1 second
      
      # Print metrics for inspection
      IO.puts("Feedback Dashboard WebSocket Performance Metrics:")
      IO.puts("Connect time: #{metrics.connect_time}ms")
      IO.puts("Average event time: #{metrics.avg_event_time}ms")
      IO.puts("Disconnect time: #{metrics.disconnect_time}ms")
    end
    
    test "handles multiple concurrent connections", %{conn: conn} do
      # Create multiple concurrent connections to simulate load
      connections = for _i <- 1..3 do
        {:ok, view, _} = live(conn, "/feedback-dashboard")
        view
      end
      
      # Verify all connections are alive
      for view <- connections do
        assert Process.alive?(view.pid)
        assert render(view) =~ "Feedback Dashboard"
      end
      
      # Perform actions on all connections concurrently
      for view <- connections do
        view |> render_click(%{type: "filter", value: "feature"})
      end
      
      # Verify all connections are still alive after interactions
      for view <- connections do
        assert Process.alive?(view.pid)
      end
    end
  end
  
  # Helper function to count feedback items in HTML
  defp count_feedback_items(html) do
    ~r/class="feedback-item"/
    |> Regex.scan(html)
    |> length()
  end
end