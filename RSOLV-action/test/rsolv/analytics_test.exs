defmodule Rsolv.AnalyticsTest do
  use Rsolv.DataCase

  alias Rsolv.Analytics

  describe "events" do
    alias Rsolv.Analytics.Event

    @valid_attrs %{
      event_type: "pageview",
      visitor_id: "test-visitor-123",
      session_id: "test-session-456",
      page_path: "/pricing",
      referrer: "https://google.com",
      user_agent: "Mozilla/5.0 Test Browser",
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "summer-sale",
      metadata: %{"custom" => "data"}
    }

    @invalid_attrs %{event_type: nil}

    test "create_event/1 with valid data creates an event" do
      assert {:ok, %Event{} = event} = Analytics.create_event(@valid_attrs)
      assert event.event_type == "pageview"
      assert event.visitor_id == "test-visitor-123"
      assert event.page_path == "/pricing"
      assert event.metadata == %{"custom" => "data"}
    end

    test "create_event/1 with invalid data returns error changeset" do
      assert {:error, %Ecto.Changeset{}} = Analytics.create_event(@invalid_attrs)
    end

    test "list_events/0 returns all events" do
      {:ok, event} = Analytics.create_event(@valid_attrs)
      assert Analytics.list_events() == [event]
    end

    test "get_event!/1 returns the event with given id" do
      {:ok, event} = Analytics.create_event(@valid_attrs)
      assert Analytics.get_event!(event.id) == event
    end

    test "list_events_by_type/1 returns events of specific type" do
      {:ok, pageview} = Analytics.create_event(@valid_attrs)
      {:ok, _conversion} = Analytics.create_event(%{@valid_attrs | event_type: "conversion"})
      
      assert Analytics.list_events_by_type("pageview") == [pageview]
    end

    test "list_events_by_visitor/1 returns events for specific visitor" do
      {:ok, event} = Analytics.create_event(@valid_attrs)
      {:ok, _other} = Analytics.create_event(%{@valid_attrs | visitor_id: "other-visitor"})
      
      assert Analytics.list_events_by_visitor("test-visitor-123") == [event]
    end

    test "list_events_in_range/2 returns events within date range" do
      # Create event today
      {:ok, recent} = Analytics.create_event(@valid_attrs)
      
      # Create event 10 days ago (within our current month partition)
      ten_days_ago = DateTime.utc_now() |> DateTime.add(-10, :day)
      ten_days_ago_naive = DateTime.to_naive(ten_days_ago) |> NaiveDateTime.truncate(:second)
      
      # Ensure partition exists for the past date
      Analytics.ensure_partition_exists(ten_days_ago)
      
      past_event = %Event{}
      |> Event.changeset(@valid_attrs)
      |> Ecto.Changeset.put_change(:inserted_at, ten_days_ago_naive)
      |> Repo.insert!()
      
      # Query for events from last 7 days
      start_date = DateTime.utc_now() |> DateTime.add(-7, :day)
      end_date = DateTime.utc_now()
      
      results = Analytics.list_events_in_range(start_date, end_date)
      assert recent in results
      refute past_event in results
    end

    test "count_events_by_type/0 returns event counts grouped by type" do
      Analytics.create_event(@valid_attrs)
      Analytics.create_event(@valid_attrs)
      Analytics.create_event(%{@valid_attrs | event_type: "conversion"})
      
      counts = Analytics.count_events_by_type()
      assert counts["pageview"] == 2
      assert counts["conversion"] == 1
    end

    test "get_daily_stats/1 returns aggregated daily statistics" do
      # Create events
      Analytics.create_event(@valid_attrs)
      Analytics.create_event(%{@valid_attrs | event_type: "conversion"})
      
      # Get stats for today
      today = Date.utc_today()
      stats = Analytics.get_daily_stats(today)
      
      assert stats.date == today
      assert stats.total_events == 2
      assert stats.unique_visitors == 1
      assert stats.pageviews == 1
      assert stats.conversions == 1
    end
  end
end