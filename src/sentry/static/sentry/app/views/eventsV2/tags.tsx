import React from 'react';
import PropTypes from 'prop-types';
import styled from 'react-emotion';
import isEqual from 'lodash/isEqual';
import {Location} from 'history';
import {t} from 'app/locale';
import * as Sentry from '@sentry/browser';

import space from 'app/styles/space';
import {Client} from 'app/api';
import SentryTypes from 'app/sentryTypes';
import Placeholder from 'app/components/placeholder';
import TagDistributionMeter from 'app/components/tagDistributionMeter';
import withApi from 'app/utils/withApi';
import {Organization} from 'app/types';
import {trackAnalyticsEvent} from 'app/utils/analytics';
import {SectionHeading} from './styles';

import {
  fetchTagDistribution,
  fetchTotalCount,
  getEventTagSearchUrl,
  Tag,
  TagTopValue,
  pickTagParams,
} from './utils';
import EventView from './eventView';

type Props = {
  api: Client;
  organization: Organization;
  eventView: EventView;
  location: Location;
};

type State = {
  tags: {[key: string]: Tag};
  totalValues: null | number;
  tagsFetchID: symbol | undefined;
};

class Tags extends React.Component<Props, State> {
  static propTypes: any = {
    api: PropTypes.object.isRequired,
    organization: SentryTypes.Organization.isRequired,
    location: PropTypes.object.isRequired,
    eventView: PropTypes.object.isRequired,
  };

  state: State = {
    tags: {},
    totalValues: null,
    tagsFetchID: undefined,
  };

  componentDidMount() {
    this.fetchData();
  }

  componentDidUpdate(prevProps: Props) {
    const tagsChanged = !isEqual(
      new Set(this.props.eventView.tags),
      new Set(prevProps.eventView.tags)
    );

    if (tagsChanged || this.shouldRefetchData(prevProps)) {
      this.fetchData();
    }
  }

  shouldRefetchData = (prevProps: Props): boolean => {
    const thisAPIPayload = pickTagParams(
      this.props.eventView.getEventsAPIPayload(this.props.location)
    );
    const otherAPIPayload = pickTagParams(
      prevProps.eventView.getEventsAPIPayload(prevProps.location)
    );

    return !isEqual(thisAPIPayload, otherAPIPayload);
  };

  fetchData = async () => {
    const {api, organization, eventView, location} = this.props;

    const tagsFetchID = Symbol('tagsFetchID');
    this.setState({tags: {}, totalValues: null, tagsFetchID});

    const queryPayload = pickTagParams(eventView.getEventsAPIPayload(location));

    eventView.tags.forEach(async tag => {
      try {
        const val = await fetchTagDistribution(api, organization.slug, tag, queryPayload);

        this.setState((state: Readonly<State>) => {
          if (state.tagsFetchID !== tagsFetchID) {
            // invariant: a different request was initiated after this request
            return state;
          }

          return {
            ...state,
            tags: {...state.tags, [tag]: val},
          };
        });
      } catch (err) {
        Sentry.captureException(err);
      }
    });

    try {
      const totalValues = await fetchTotalCount(api, organization.slug, queryPayload);
      this.setState(state => {
        if (state.tagsFetchID !== tagsFetchID) {
          // invariant: a different request was initiated after this request
          return state;
        }

        return {...state, totalValues};
      });
    } catch (err) {
      Sentry.captureException(err);
    }
  };

  onTagClick = (tag: string, segment: TagTopValue) => {
    const {organization} = this.props;
    // metrics
    trackAnalyticsEvent({
      eventKey: 'discover_v2.facet_map.clicked',
      eventName: 'Discoverv2: Clicked on a tag on the facet map',
      tag,
      value: segment.value,
      organization_id: organization.id,
    });
  };

  renderTag(tag) {
    const {location} = this.props;
    const {tags, totalValues} = this.state;
    const isLoading = !tags[tag] || totalValues === null;

    let segments: Array<TagTopValue> = [];

    if (!isLoading) {
      segments = tags[tag].topValues;
    }

    segments.forEach(segment => {
      segment.url = getEventTagSearchUrl(tag, segment.value, location);
    });

    return (
      <TagDistributionMeter
        key={tag}
        title={tag}
        segments={segments}
        totalValues={totalValues}
        isLoading={isLoading}
        renderLoading={() => <StyledPlaceholder height="16px" />}
        onTagClick={this.onTagClick}
      />
    );
  }

  render() {
    return (
      <TagSection>
        <StyledHeading>{t('Event Tag Summary')}</StyledHeading>
        {this.props.eventView.tags.map(tag => this.renderTag(tag))}
      </TagSection>
    );
  }
}

const StyledHeading = styled(SectionHeading)`
  margin: 0 0 ${space(1.5)} 0;
`;

const TagSection = styled('div')`
  margin: ${space(2)} 0;
`;

const StyledPlaceholder = styled(Placeholder)`
  border-radius: ${p => p.theme.borderRadius};
`;

export {Tags};
export default withApi(Tags);
