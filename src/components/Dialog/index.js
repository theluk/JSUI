import React, { Component } from 'react';
import ReactDOM from 'react-dom';
import { observer } from 'mobx-react';
import keydown from 'react-keydown';

import emotion from 'react-emotion';
import { absolute, marginVertical, screenSize } from 'styles/mixins';
import flex from 'styles/flex';

import { transparentize } from 'polished';
import { colors } from 'styles/colors';

export const Wrapper = emotion.div({
  ...flex.vertical,
  ...flex.centerVertical,
  ...absolute,
  width: '100vw',
  zIndex: 100
});

export const Background = emotion.div({
  ...absolute,
  ...screenSize,
  flex: 1,
  zIndex: 0,
  backgroundColor: transparentize(0.2, colors.purple2)
});

export const Content = emotion.div(
  {
    ...flex.vertical,
    color: '#f0f0f0',
    zIndex: 1,
    width: '60%',
    ...marginVertical(30)
  },
  ({ autoHeight, styles } = {}) => ({
    ...(!autoHeight && {
      height: '100%',
      maxHeight: 700,
      maxWidth: 700,
      backgroundColor: '#2b334c',
      boxShadow: `0px 0px 60px 11px ${colors.purple2}`
    }),
    ...styles
  })
);

@observer
class Dialog extends Component {
  @keydown('esc')
  onEscape() {
    if (this.props.onEsc) {
      this.props.onEsc && this.props.onEsc();
    } else {
      this.props.onClose && this.props.onClose();
    }
  }

  state = {
    height: '100vh'
  };

  static defaultProps = {
    inPortal: true
  };

  renderContent() {
    const { id, onClose, maxWidth, isMobile, autoHeight, children, className, styles = {} } = this.props;
    const { height } = this.state;

    return (
      <Wrapper styles={styles.wrapper} id={id} isMobile={isMobile} className={className}>
        {!isMobile && <Background styles={styles.background} onClick={onClose} />}
        <Content styles={styles.content} autoHeight={autoHeight} height={height}>
          {children}
        </Content>
      </Wrapper>
    );
  }

  render() {
    const { inPortal } = this.props;
    return inPortal
      ? ReactDOM.createPortal(this.renderContent(), document.getElementById('dialog'))
      : this.renderContent();
  }
}

export default Dialog;
