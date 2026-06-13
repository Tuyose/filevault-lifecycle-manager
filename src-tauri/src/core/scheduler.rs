use chrono::{DateTime, Datelike, Duration, NaiveDate, NaiveTime, Utc, Weekday};

use crate::models::watch_folder::WatchFrequency;

/// Calculate the next scan time based on the schedule configuration.
pub fn calculate_next_scan(
    frequency: WatchFrequency,
    preferred_weekday: Option<i32>,
    preferred_hour: i32,
    preferred_minute: i32,
    from: DateTime<Utc>,
) -> DateTime<Utc> {
    let hour = preferred_hour.clamp(0, 23) as u32;
    let minute = preferred_minute.clamp(0, 59) as u32;

    match frequency {
        WatchFrequency::Daily => next_daily(from, hour, minute),
        WatchFrequency::Weekly => {
            let day = preferred_weekday.unwrap_or(0).rem_euclid(7) as u32;
            next_weekly(from, day, hour, minute)
        }
        WatchFrequency::Monthly => {
            let day = (preferred_weekday.unwrap_or(1).clamp(1, 28)) as u32;
            next_monthly(from, day, hour, minute)
        }
    }
}

fn naive_at(from: DateTime<Utc>, hour: u32, minute: u32) -> DateTime<Utc> {
    let date = from.date_naive();
    date.and_time(NaiveTime::from_hms_opt(hour, minute, 0).unwrap())
        .and_utc()
}

fn next_daily(from: DateTime<Utc>, hour: u32, minute: u32) -> DateTime<Utc> {
    let candidate = naive_at(from, hour, minute);
    if candidate > from {
        candidate
    } else {
        candidate + Duration::days(1)
    }
}

fn weekday_to_u32(w: Weekday) -> u32 {
    match w {
        Weekday::Mon => 0,
        Weekday::Tue => 1,
        Weekday::Wed => 2,
        Weekday::Thu => 3,
        Weekday::Fri => 4,
        Weekday::Sat => 5,
        Weekday::Sun => 6,
    }
}

fn u32_to_weekday(d: u32) -> Weekday {
    match d % 7 {
        0 => Weekday::Mon,
        1 => Weekday::Tue,
        2 => Weekday::Wed,
        3 => Weekday::Thu,
        4 => Weekday::Fri,
        5 => Weekday::Sat,
        _ => Weekday::Sun,
    }
}

fn next_weekly(from: DateTime<Utc>, weekday: u32, hour: u32, minute: u32) -> DateTime<Utc> {
    let target = u32_to_weekday(weekday);
    let current = weekday_to_u32(from.weekday());
    let target_num = weekday_to_u32(target);
    let days_ahead = (target_num as i64 - current as i64 + 7) % 7;
    let mut candidate = naive_at(from, hour, minute);
    if days_ahead > 0 {
        candidate += Duration::days(days_ahead);
    } else if days_ahead == 0 && candidate <= from {
        candidate += Duration::days(7);
    }
    candidate
}

fn next_monthly(from: DateTime<Utc>, day: u32, hour: u32, minute: u32) -> DateTime<Utc> {
    let day = day.min(28);
    let naive = if day > from.day() {
        // Same month, future day
        from.date_naive()
    } else {
        // Next month
        if from.month() == 12 {
            NaiveDate::from_ymd_opt(from.year() + 1, 1, day)
        } else {
            NaiveDate::from_ymd_opt(from.year(), from.month() + 1, day)
        }
        .unwrap_or_else(|| from.date_naive() + Duration::days(1))
    };

    let last = days_in_month(naive.year(), naive.month());
    let safe_day = day.min(last);

    let date = NaiveDate::from_ymd_opt(naive.year(), naive.month(), safe_day)
        .unwrap_or_else(|| from.date_naive() + Duration::days(1));

    date.and_time(NaiveTime::from_hms_opt(hour, minute, 0).unwrap())
        .and_utc()
}

fn days_in_month(year: i32, month: u32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0) {
                29
            } else {
                28
            }
        }
        _ => 30,
    }
}

#[cfg(test)]
mod tests {
    use chrono::{Timelike, Datelike, Weekday};
    use super::*;

    #[test]
    fn test_daily_next_scan() {
        let from = "2026-06-13T10:00:00Z".parse::<DateTime<Utc>>().unwrap();
        let next = calculate_next_scan(WatchFrequency::Daily, None, 20, 0, from);
        assert!(next > from);
        assert_eq!(next.hour(), 20);
    }

    #[test]
    fn test_weekly_next_scan() {
        let from = "2026-06-13T10:00:00Z".parse::<DateTime<Utc>>().unwrap(); // Saturday
        let next = calculate_next_scan(WatchFrequency::Weekly, Some(0), 9, 0, from); // Monday
        assert!(next > from);
        assert_eq!(next.weekday(), Weekday::Mon);
    }

    #[test]
    fn test_monthly_next_scan() {
        let from = "2026-06-13T10:00:00Z".parse::<DateTime<Utc>>().unwrap();
        let next = calculate_next_scan(WatchFrequency::Monthly, Some(1), 12, 0, from);
        assert!(next > from);
        assert_eq!(next.month(), 7);
        assert_eq!(next.day(), 1);
    }
}
